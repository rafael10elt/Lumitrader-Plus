import OpenAI from "openai";
import { getOpenAiApiKey } from "@/lib/env";
import type { LoadedContext } from "@/lib/backend/supabase";
import type { ReportPayload, TradingEventPayload } from "@/lib/backend/types";

const summaryModel = "gpt-5";
const validationModel = "gpt-5-mini";

type TradeOpportunityValidationInput = {
  context: LoadedContext;
  payload: TradingEventPayload;
  signal: {
    type: "open_buy" | "open_sell";
    lot: number;
    stopLoss: number;
    takeProfit: number;
    rationale: string;
  };
  operationsToday: number;
};

type TradeOpportunityValidationResult = {
  approved: boolean;
  summary: string;
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

function buildTradeValidationPrompt(input: TradeOpportunityValidationInput) {
  const balance = input.payload.account.balance ?? input.context.account.saldo_atual;
  const equity = input.payload.account.equity ?? input.context.account.equity;
  const market = input.payload.market ?? {};

  return [
    "Voce e o comite de validacao do Lumitrader.",
    "A matematica ja aprovou uma oportunidade. Sua funcao e somente validar se o contexto real do mercado apoia a entrada agora.",
    "Responda em JSON puro com as chaves: approved (boolean) e summary (string curta, maximo 180 caracteres).",
    "Aprovacao so quando houver contexto favoravel e coerente com tendencia, RSI, MM20, suporte/resistencia e restricoes do usuario.",
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
        notes: market.notes?.slice(0, 6),
      },
      signal: input.signal,
      operationsToday: input.operationsToday,
    }),
  ].join("\n");
}

function parseValidationResponse(raw: string): Pick<TradeOpportunityValidationResult, "approved" | "summary"> {
  try {
    const parsed = JSON.parse(raw) as { approved?: boolean; summary?: string };
    return {
      approved: parsed.approved === true,
      summary: typeof parsed.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : (parsed.approved === true ? "IA validou a entrada." : "IA rejeitou a entrada por contexto insuficiente."),
    };
  } catch {
    const normalized = raw.trim();
    return {
      approved: /^\s*\{?\s*"?approved"?\s*:\s*true/i.test(normalized),
      summary: normalized.slice(0, 180) || "Resposta invalida da IA.",
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

export async function validateTradeOpportunity(input: TradeOpportunityValidationInput): Promise<TradeOpportunityValidationResult> {
  const client = getClient();
  const response = await client.responses.create({
    model: validationModel,
    input: buildTradeValidationPrompt(input),
  });

  const parsed = parseValidationResponse(response.output_text);

  return {
    approved: parsed.approved,
    summary: parsed.summary,
    request_id: response._request_id ?? null,
    model: validationModel,
  };
}