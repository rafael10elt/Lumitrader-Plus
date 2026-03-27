import OpenAI from "openai";
import { getOpenAiApiKey } from "@/lib/env";
import type { AutoSignal } from "@/lib/backend/auto-trader";
import type { LoadedContext } from "@/lib/backend/supabase";
import type { ReportPayload, TradingEventPayload } from "@/lib/backend/types";

const summaryModel = "gpt-5";
const decisionModel = "gpt-5-mini";

type TradeOpportunityDecisionInput = {
  context: LoadedContext;
  payload: TradingEventPayload;
  candidates: AutoSignal[];
  operationsToday: number;
};

type TradeOpportunityDecisionResult = {
  action: AutoSignal["type"] | "wait";
  summary: string;
  confidence: number | null;
  request_id: string | null;
  model: string;
};

function getClient() {
  return new OpenAI({ apiKey: getOpenAiApiKey() });
}

function buildPrompt(report: Omit<ReportPayload, "ai" | "formats">) {
  return [
    "Voce e o analista do Lumitrader.",
    "Resuma a operacao em portugues do Brasil, com foco objetivo e operacional.",
    "Inclua contexto de risco, situacao da conta e um comentario util para Telegram.",
    "Se o evento for de abertura, destaque o setup e o risco.",
    "Se o evento for de fechamento, destaque resultado, risco-retorno e disciplina operacional.",
    "Responda em no maximo 5 linhas curtas.",
    JSON.stringify(report),
  ].join("\n");
}

function buildTradeDecisionPrompt(input: TradeOpportunityDecisionInput) {
  const balance = input.payload.account.balance ?? input.context.account.saldo_atual;
  const equity = input.payload.account.equity ?? input.context.account.equity;
  const market = input.payload.market ?? {};

  return [
    "Voce e a mesa de decisao do Lumitrader.",
    "Os gates duros ja foram aprovados e sao irrevogaveis: conta em PLAY, horario valido, sem meta/perda/limite violados e sem posicao aberta.",
    "Sua tarefa e decidir se existe oportunidade real AGORA para abrir compra, abrir venda ou nao operar.",
    "Voce deve ser conservador: prefira wait quando o contexto estiver neutro, conflitado, sem momentum claro ou sem edge suficiente.",
    "Os planos candidatos ja sao matematicamente validos e respeitam o risco do usuario; sua funcao e escolher open_buy, open_sell ou wait.",
    "Responda em JSON puro com as chaves: action (open_buy|open_sell|wait), summary (string curta max 180 caracteres), confidence (numero de 0 a 1).",
    JSON.stringify({
      account: {
        number: input.context.account.numero_conta,
        balance,
        equity,
      },
      config: {
        ativo: input.context.config?.ativo,
        timeframe: input.context.config?.timeframe,
        modo: input.context.config?.modo,
        breakeven_ativo: input.context.config?.breakeven_ativo,
        trailing_stop_ativo: input.context.config?.trailing_stop_ativo,
        meta_lucro_diaria: input.context.config?.meta_lucro_diaria,
        perda_maxima_diaria: input.context.config?.perda_maxima_diaria,
        limite_operacoes_ativo: input.context.config?.limite_operacoes_ativo,
        limite_operacoes_diaria: input.context.config?.limite_operacoes_diaria,
        risco_por_operacao: input.context.config?.risco_por_operacao,
      },
      market: {
        trend: market.trend,
        rsi: market.rsi,
        moving_average_20: market.moving_average_20,
        support: market.support,
        resistance: market.resistance,
        last_bid: market.last_bid,
        last_ask: market.last_ask,
        notes: market.notes?.slice(0, 8),
        candles: market.candles?.slice(-8),
      },
      candidates: input.candidates,
      operationsToday: input.operationsToday,
    }),
  ].join("\n");
}

function parseDecisionResponse(raw: string): Pick<TradeOpportunityDecisionResult, "action" | "summary" | "confidence"> {
  try {
    const parsed = JSON.parse(raw) as { action?: string; summary?: string; confidence?: number };
    const action = parsed.action === "open_buy" || parsed.action === "open_sell" ? parsed.action : "wait";
    return {
      action,
      summary: typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim().slice(0, 180)
        : (action === "wait" ? "IA nao encontrou edge suficiente no momento." : "IA aprovou a entrada."),
      confidence: typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null,
    };
  } catch {
    const normalized = raw.trim();
    const lower = normalized.toLowerCase();
    const action = lower.includes("open_buy") ? "open_buy" : lower.includes("open_sell") ? "open_sell" : "wait";
    return {
      action,
      summary: normalized.slice(0, 180) || "Resposta invalida da IA.",
      confidence: null,
    };
  }
}

export async function generateAiSummary(report: Omit<ReportPayload, "ai" | "formats">) {
  const client = getClient();
  const response = await client.responses.create({
    model: summaryModel,
    input: buildPrompt(report),
  });

  return {
    summary: response.output_text.trim(),
    request_id: response._request_id ?? null,
    model: summaryModel,
  };
}

export async function decideTradeOpportunity(input: TradeOpportunityDecisionInput): Promise<TradeOpportunityDecisionResult> {
  const client = getClient();
  const response = await client.responses.create({
    model: decisionModel,
    input: buildTradeDecisionPrompt(input),
  });

  const parsed = parseDecisionResponse(response.output_text);

  return {
    action: parsed.action,
    summary: parsed.summary,
    confidence: parsed.confidence,
    request_id: response._request_id ?? null,
    model: decisionModel,
  };
}
