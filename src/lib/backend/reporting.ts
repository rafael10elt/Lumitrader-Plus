import { evaluateAutoOpportunity } from "@/lib/backend/auto-trader";
import { toCsv, toHtml } from "@/lib/backend/formatters";
import { sendReportToN8n } from "@/lib/backend/n8n";
import { decideTradeOpportunity, generateAiSummary } from "@/lib/backend/openai";
import { calculateRiskSnapshot } from "@/lib/backend/risk";
import { hasOpenAiApiKey } from "@/lib/env";
import {
  attachOperationTelemetry,
  countOperationsToday,
  enqueueAutoTradeCommand,
  loadAccountExecutionState,
  loadDailyOperationSummary,
  loadTradingContext,
  recordTradingEvent,
  reconcileOpenOperations,
  refreshDailyStats,
  updateAccountAutomationState,
  updateAccountSnapshot,
} from "@/lib/backend/supabase";
import type { AutoSignal } from "@/lib/backend/auto-trader";
import type { ReportPayload, TradingEventPayload } from "@/lib/backend/types";

const aiDecisionCache = new Map<string, { expiresAt: number; action: AutoSignal["type"] | "wait"; summary: string; confidence: number | null }>();
const AI_DECISION_TTL_MS = 90_000;
const MIN_AI_CONFIDENCE_TO_OPEN = 0.55;

function buildDecisionCacheKey(payload: TradingEventPayload, candidates: AutoSignal[]) {
  return JSON.stringify({
    account: payload.account.number,
    trend: payload.market?.trend ?? null,
    rsi: payload.market?.rsi != null ? Number(payload.market.rsi.toFixed(1)) : null,
    ma20: payload.market?.moving_average_20 != null ? Number(payload.market.moving_average_20.toFixed(2)) : null,
    support: payload.market?.support != null ? Number(payload.market.support.toFixed(2)) : null,
    resistance: payload.market?.resistance != null ? Number(payload.market.resistance.toFixed(2)) : null,
    bid: payload.market?.last_bid != null ? Number(payload.market.last_bid.toFixed(2)) : null,
    ask: payload.market?.last_ask != null ? Number(payload.market.last_ask.toFixed(2)) : null,
    candidates: candidates.map((candidate) => ({
      type: candidate.type,
      entryPrice: candidate.entryPrice,
      lot: candidate.lot,
      stopLoss: candidate.stopLoss,
      takeProfit: candidate.takeProfit,
      riskRewardRatio: candidate.riskRewardRatio,
    })),
  });
}

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
    const currentOpenTickets = Array.isArray(payload.account.open_position_tickets)
      ? payload.account.open_position_tickets.filter((ticket): ticket is string => typeof ticket === "string" && ticket.length > 0)
      : [];

    await reconcileOpenOperations(context.account.id, currentOpenTickets);

    const [operationsToday, executionState, dailySummary] = await Promise.all([
      countOperationsToday(context.account.id),
      loadAccountExecutionState(context.account.id),
      loadDailyOperationSummary(context.account.id),
    ]);

    const assessment = evaluateAutoOpportunity(
      context,
      payload,
      operationsToday,
      dailySummary.profitTotal,
      dailySummary.lossTotal,
    );

    if (assessment.candidates.length === 0) {
      await updateAccountAutomationState(context.account.id, assessment.status, assessment.reason);
      return { synced: true, account: payload.account.number, mode: "fast_sync", autoCommand: null, aiValidation: assessment.reason };
    }

    if (executionState.hasOpenPosition || executionState.hasPendingCommand) {
      const blockedReason = executionState.hasOpenPosition
        ? "Automacao bloqueada: ja existe posicao aberta no banco."
        : "Automacao bloqueada: existe comando pendente ou em processamento.";
      await updateAccountAutomationState(context.account.id, "blocked", blockedReason);
      return { synced: true, account: payload.account.number, mode: "fast_sync", autoCommand: null, aiValidation: blockedReason };
    }

    if (!hasOpenAiApiKey()) {
      const reason = "OpenAI indisponivel; automacao automatica fica bloqueada porque a IA e o decisor central.";
      await updateAccountAutomationState(context.account.id, "blocked", reason);
      return { synced: true, account: payload.account.number, mode: "fast_sync", autoCommand: null, aiValidation: reason };
    }

    const cacheKey = buildDecisionCacheKey(payload, assessment.candidates);
    const cachedDecision = aiDecisionCache.get(cacheKey);
    const now = Date.now();
    const aiDecision = cachedDecision && cachedDecision.expiresAt > now
      ? cachedDecision
      : await (async () => {
        const freshDecision = await decideTradeOpportunity({
          context,
          payload,
          candidates: assessment.candidates,
          operationsToday,
        });

        const cacheValue = {
          expiresAt: now + AI_DECISION_TTL_MS,
          action: freshDecision.action,
          summary: freshDecision.summary,
          confidence: freshDecision.confidence,
        };

        aiDecisionCache.set(cacheKey, cacheValue);
        return cacheValue;
      })();

    if (aiDecision.action === "wait") {
      await updateAccountAutomationState(context.account.id, "awaiting", aiDecision.summary);
      return {
        synced: true,
        account: payload.account.number,
        mode: "fast_sync",
        autoCommand: null,
        aiValidation: aiDecision.summary,
      };
    }

    if (aiDecision.confidence != null && aiDecision.confidence < MIN_AI_CONFIDENCE_TO_OPEN) {
      const lowConfidenceReason = `IA viu edge fraco (${aiDecision.confidence.toFixed(2)}); aguardando melhor contexto.`;
      await updateAccountAutomationState(context.account.id, "awaiting", lowConfidenceReason);
      return {
        synced: true,
        account: payload.account.number,
        mode: "fast_sync",
        autoCommand: null,
        aiValidation: lowConfidenceReason,
      };
    }

    const chosenSignal = assessment.candidates.find((candidate) => candidate.type === aiDecision.action) ?? null;
    if (!chosenSignal) {
      const invalidDecisionReason = "IA retornou uma acao sem plano matematico correspondente.";
      await updateAccountAutomationState(context.account.id, "blocked", invalidDecisionReason);
      return {
        synced: true,
        account: payload.account.number,
        mode: "fast_sync",
        autoCommand: null,
        aiValidation: invalidDecisionReason,
      };
    }

    const enqueueResult = await enqueueAutoTradeCommand(context, payload, {
      type: chosenSignal.type,
      lot: chosenSignal.lot,
      stopLoss: chosenSignal.stopLoss,
      takeProfit: chosenSignal.takeProfit,
      rationale: `${chosenSignal.rationale} | IA: ${aiDecision.summary}`,
    });

    if (!enqueueResult.enqueued) {
      await updateAccountAutomationState(context.account.id, "blocked", enqueueResult.reason);
      return {
        synced: true,
        account: payload.account.number,
        mode: "fast_sync",
        autoCommand: null,
        aiValidation: enqueueResult.reason,
      };
    }

    const readyReason = `${aiDecision.summary} | ${chosenSignal.type === "open_buy" ? "Compra" : "Venda"} enfileirada com RR ${chosenSignal.riskRewardRatio.toFixed(2)}.`;
    await updateAccountAutomationState(context.account.id, "ready", readyReason);
    return {
      synced: true,
      account: payload.account.number,
      mode: "fast_sync",
      autoCommand: chosenSignal.type,
      aiValidation: readyReason,
    };
  }

  if (!payload.operation) {
    throw new Error("Operacao obrigatoria para este evento.");
  }

  const operationPayload = payload.operation;
  const operationId = await recordTradingEvent(context, payload);
  if (payload.event === "operation_closed" || payload.event === "operation_partially_closed") {
    await refreshDailyStats(context, payload);
  }
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
