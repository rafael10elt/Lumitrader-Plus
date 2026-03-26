import { toCsv, toHtml } from "@/lib/backend/formatters";
import { sendReportToN8n } from "@/lib/backend/n8n";
import { generateAiSummary } from "@/lib/backend/openai";
import { evaluateAutoOpportunity } from "@/lib/backend/auto-trader";
import { calculateRiskSnapshot } from "@/lib/backend/risk";
import {
  attachOperationTelemetry,
  countOperationsToday,
  enqueueAutoTradeCommand,
  loadAccountExecutionState,
  loadTradingContext,
  recordTradingEvent,
  refreshDailyStats,
  updateAccountSnapshot,
} from "@/lib/backend/supabase";
import type { ReportPayload, TradingEventPayload } from "@/lib/backend/types";

export async function processTradingEvent(payload: TradingEventPayload) {
  const context = await loadTradingContext(payload.account.number);

  if (!context.user.acesso_ativo) {
    throw new Error("Usuario bloqueado pelo SaaS.");
  }

  const licenseActive = context.license.status === "ativa" && context.license.data_expiracao >= new Date().toISOString().slice(0, 10);
  if (!licenseActive) {
    throw new Error("Licenca inativa, bloqueada ou expirada para esta conta MT5.");
  }

  await updateAccountSnapshot(context.account.id, payload);

  if (payload.event === "account_sync") {
    const [operationsToday, executionState] = await Promise.all([
      countOperationsToday(context.account.id),
      loadAccountExecutionState(context.account.id),
    ]);

    const signal = evaluateAutoOpportunity(context, payload, operationsToday);

    if (signal && !executionState.hasOpenPosition && !executionState.hasPendingCommand) {
      await enqueueAutoTradeCommand(context, payload, signal);
      return { synced: true, account: payload.account.number, mode: "fast_sync", autoCommand: signal.type };
    }

    return { synced: true, account: payload.account.number, mode: "fast_sync" };
  }

  if (!payload.operation) {
    throw new Error("Operacao obrigatoria para este evento.");
  }

  const operationPayload = payload.operation;
  const operationId = await recordTradingEvent(context, payload);
  await refreshDailyStats(context, payload);
  const operationsToday = await countOperationsToday(context.account.id);

  const risk = calculateRiskSnapshot({
    payload,
    balance: payload.account.balance ?? context.account.saldo_atual,
    equity: payload.account.equity ?? context.account.equity,
    operationsToday,
    sessionConfig: {
      daily_loss_limit: payload.session?.daily_loss_limit ?? context.config?.perda_maxima_diaria ?? null,
      operation_limit_enabled: payload.session?.operation_limit_enabled ?? context.config?.limite_operacoes_ativo ?? null,
      operation_limit: payload.session?.operation_limit ?? context.config?.limite_operacoes_diaria ?? null,
    },
  });

  const baseReport: Omit<ReportPayload, "ai" | "formats"> = {
    event: payload.event,
    generatedAt: new Date().toISOString(),
    user: {
      id: context.user.id,
      nome: context.user.nome,
      email: context.user.email,
      telegram_id: context.user.telegram_id,
    },
    account: {
      id: context.account.id,
      number: context.account.numero_conta,
      broker: payload.account.broker ?? context.account.corretora,
      currency_code: payload.account.currency_code ?? context.account.moeda_codigo,
      currency_symbol: payload.account.currency_symbol ?? context.account.moeda_simbolo,
      balance: payload.account.balance ?? context.account.saldo_atual,
      equity: payload.account.equity ?? context.account.equity,
      active_license: {
        id: context.license.id,
        plan: context.license.nome_plano,
        expires_at: context.license.data_expiracao,
        status: context.license.status,
        value: context.license.valor,
      },
    },
    operation: operationPayload,
    risk,
  };

  const ai = await generateAiSummary(baseReport);
  const reportWithoutFormats: Omit<ReportPayload, "formats"> = {
    ...baseReport,
    ai,
  };

  await attachOperationTelemetry(operationId, payload, reportWithoutFormats);
  await updateAccountSnapshot(context.account.id, payload, ai.summary);

  const report: ReportPayload = {
    ...reportWithoutFormats,
    formats: {
      json: JSON.stringify(reportWithoutFormats, null, 2),
      csv: toCsv(reportWithoutFormats),
      html: toHtml(reportWithoutFormats),
    },
  };

  await sendReportToN8n(report);

  return report;
}
