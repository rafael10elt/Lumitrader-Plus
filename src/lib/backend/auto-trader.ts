import type { LoadedContext } from "@/lib/backend/supabase";
import type { TradingEventPayload } from "@/lib/backend/types";

export type AutoSignal = {
  type: "open_buy" | "open_sell";
  entryPrice: number;
  lot: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  rationale: string;
};

export type AutoOpportunityAssessment = {
  candidates: AutoSignal[];
  status: "blocked" | "ready" | "awaiting";
  reason: string;
};

const LOT_STEP = 0.01;
const MIN_AUTO_LOT = 0.01;
const PRICE_VALUE_PER_LOT = 100;
const MIN_RISK_REWARD = 1.25;
const DEFAULT_TARGET_MULTIPLIER = 1.8;

function roundPrice(value: number) {
  return Number(value.toFixed(2));
}

function roundLot(value: number) {
  return Number((Math.floor(value / LOT_STEP) * LOT_STEP).toFixed(2));
}

function computeRiskDistance(entry: number, reference: number | null | undefined) {
  const structuralDistance = reference != null ? Math.abs(entry - reference) : 0;
  const minimumDistance = Math.max(entry * 0.001, 2);
  return Math.max(structuralDistance, minimumDistance);
}

function parseTimeToMinutes(timeValue: string) {
  const [hour, minute] = timeValue.slice(0, 5).split(":").map(Number);
  return (hour * 60) + minute;
}

function isWithinTradingWindow(referenceDate: Date, start: string, end: string) {
  const currentMinutes = (referenceDate.getHours() * 60) + referenceDate.getMinutes();
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function computeDynamicLot(args: {
  balance: number;
  equity: number;
  dailyLossLimit: number;
  riskPercent: number;
  stopDistance: number;
}) {
  const safeBalance = Math.max(args.balance, 0);
  const floatingLoss = Math.max(safeBalance - Math.max(args.equity, 0), 0);
  const configuredRisk = args.riskPercent > 0 ? args.riskPercent : 0.01;
  const baseRiskBudget = safeBalance * configuredRisk;
  const remainingDailyLoss = args.dailyLossLimit > 0
    ? Math.max(args.dailyLossLimit - floatingLoss, 0)
    : baseRiskBudget;
  const allowedRisk = Math.min(baseRiskBudget, remainingDailyLoss);

  if (allowedRisk <= 0 || args.stopDistance <= 0) {
    return null;
  }

  const rawLot = allowedRisk / (args.stopDistance * PRICE_VALUE_PER_LOT);
  const roundedLot = roundLot(rawLot);
  return roundedLot >= MIN_AUTO_LOT ? roundedLot : null;
}

function blocked(reason: string): AutoOpportunityAssessment {
  return {
    candidates: [],
    status: "blocked",
    reason,
  };
}

function awaiting(reason: string): AutoOpportunityAssessment {
  return {
    candidates: [],
    status: "awaiting",
    reason,
  };
}

function ready(candidates: AutoSignal[], reason: string): AutoOpportunityAssessment {
  return {
    candidates,
    status: "ready",
    reason,
  };
}

function buildBuyCandidate(args: {
  market: NonNullable<TradingEventPayload["market"]>;
  balance: number;
  equity: number;
  dailyLossLimit: number;
  riskPercent: number;
}) {
  const entry = args.market.last_ask ?? null;
  if (entry == null) {
    return null;
  }

  const structuralStop = args.market.support != null && args.market.support < entry
    ? args.market.support
    : args.market.moving_average_20 != null && args.market.moving_average_20 < entry
      ? args.market.moving_average_20
      : null;
  const riskDistance = computeRiskDistance(entry, structuralStop);
  const stopLoss = roundPrice(structuralStop != null ? structuralStop : entry - riskDistance);
  const targetCandidate = args.market.resistance != null && args.market.resistance > entry
    ? args.market.resistance
    : entry + (riskDistance * DEFAULT_TARGET_MULTIPLIER);
  const takeProfit = roundPrice(Math.max(targetCandidate, entry + (riskDistance * MIN_RISK_REWARD)));
  const effectiveRisk = Math.abs(entry - stopLoss);
  const effectiveReward = Math.abs(takeProfit - entry);
  const riskRewardRatio = effectiveRisk > 0 ? Number((effectiveReward / effectiveRisk).toFixed(2)) : 0;

  if (!(stopLoss < entry) || !(takeProfit > entry) || riskRewardRatio < MIN_RISK_REWARD) {
    return null;
  }

  const lot = computeDynamicLot({
    balance: args.balance,
    equity: args.equity,
    dailyLossLimit: args.dailyLossLimit,
    riskPercent: args.riskPercent,
    stopDistance: effectiveRisk,
  });

  if (lot == null) {
    return null;
  }

  return {
    type: "open_buy" as const,
    entryPrice: roundPrice(entry),
    lot,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    rationale: `Plano de compra com RR ${riskRewardRatio.toFixed(2)} e lote ${lot.toFixed(2)}.`,
  };
}

function buildSellCandidate(args: {
  market: NonNullable<TradingEventPayload["market"]>;
  balance: number;
  equity: number;
  dailyLossLimit: number;
  riskPercent: number;
}) {
  const entry = args.market.last_bid ?? null;
  if (entry == null) {
    return null;
  }

  const structuralStop = args.market.resistance != null && args.market.resistance > entry
    ? args.market.resistance
    : args.market.moving_average_20 != null && args.market.moving_average_20 > entry
      ? args.market.moving_average_20
      : null;
  const riskDistance = computeRiskDistance(entry, structuralStop);
  const stopLoss = roundPrice(structuralStop != null ? structuralStop : entry + riskDistance);
  const targetCandidate = args.market.support != null && args.market.support < entry
    ? args.market.support
    : entry - (riskDistance * DEFAULT_TARGET_MULTIPLIER);
  const takeProfit = roundPrice(Math.min(targetCandidate, entry - (riskDistance * MIN_RISK_REWARD)));
  const effectiveRisk = Math.abs(stopLoss - entry);
  const effectiveReward = Math.abs(entry - takeProfit);
  const riskRewardRatio = effectiveRisk > 0 ? Number((effectiveReward / effectiveRisk).toFixed(2)) : 0;

  if (!(stopLoss > entry) || !(takeProfit < entry) || riskRewardRatio < MIN_RISK_REWARD) {
    return null;
  }

  const lot = computeDynamicLot({
    balance: args.balance,
    equity: args.equity,
    dailyLossLimit: args.dailyLossLimit,
    riskPercent: args.riskPercent,
    stopDistance: effectiveRisk,
  });

  if (lot == null) {
    return null;
  }

  return {
    type: "open_sell" as const,
    entryPrice: roundPrice(entry),
    lot,
    stopLoss,
    takeProfit,
    riskRewardRatio,
    rationale: `Plano de venda com RR ${riskRewardRatio.toFixed(2)} e lote ${lot.toFixed(2)}.`,
  };
}

export function evaluateAutoOpportunity(
  context: LoadedContext,
  payload: TradingEventPayload,
  operationsToday: number,
  dailyProfitTotal = 0,
  dailyLossTotal = 0,
): AutoOpportunityAssessment {
  if (payload.event !== "account_sync") {
    return blocked("Evento sem avaliacao automatica.");
  }

  if (!payload.market || !context.config) {
    return blocked("Mercado ou configuracao indisponivel para automacao.");
  }

  if (!context.account.ativo || !context.config.sistema_ligado) {
    return blocked("Conta fora de PLAY ou automacao pausada.");
  }

  const referenceDate = payload.account.server_time ? new Date(payload.account.server_time) : new Date();
  if (!isWithinTradingWindow(referenceDate, context.config.horario_inicio, context.config.horario_fim)) {
    return blocked(`Fora da janela operacional ${context.config.horario_inicio.slice(0, 5)}-${context.config.horario_fim.slice(0, 5)}.`);
  }

  if (context.config.meta_lucro_diaria > 0 && dailyProfitTotal >= context.config.meta_lucro_diaria) {
    return blocked("Meta diaria ja atingida.");
  }

  if (context.config.perda_maxima_diaria > 0 && dailyLossTotal >= context.config.perda_maxima_diaria) {
    return blocked("Perda maxima diaria ja atingida.");
  }

  const hasOpenPositionsInMt5 = (payload.account.open_positions_count ?? 0) > 0
    || (Array.isArray(payload.account.open_position_tickets) && payload.account.open_position_tickets.length > 0);
  if (hasOpenPositionsInMt5) {
    return blocked("Regra de ouro ativa: ja existe posicao aberta no MT5.");
  }

  if (context.config.limite_operacoes_ativo && context.config.limite_operacoes_diaria != null && operationsToday >= context.config.limite_operacoes_diaria) {
    return blocked("Limite diario de operacoes ja atingido.");
  }

  const floatingLoss = Math.max((payload.account.balance ?? 0) - (payload.account.equity ?? 0), 0);
  if (context.config.perda_maxima_diaria > 0 && (dailyLossTotal + floatingLoss) >= context.config.perda_maxima_diaria) {
    return blocked("Perda diaria restante insuficiente para nova entrada.");
  }

  const market = payload.market;
  const trend = market.trend ?? null;
  const rsi = market.rsi ?? null;
  const movingAverage20 = market.moving_average_20 ?? null;
  const lastBid = market.last_bid ?? null;
  const lastAsk = market.last_ask ?? null;

  if (!trend || rsi == null || movingAverage20 == null || lastBid == null || lastAsk == null) {
    return blocked("Dados de mercado insuficientes para a IA decidir o setup.");
  }

  const balance = payload.account.balance ?? 0;
  const equity = payload.account.equity ?? balance;
  const candidateArgs = {
    market,
    balance,
    equity,
    dailyLossLimit: context.config.perda_maxima_diaria,
    riskPercent: context.config.risco_por_operacao,
  };

  const candidates = [
    buildBuyCandidate(candidateArgs),
    buildSellCandidate(candidateArgs),
  ].filter((candidate): candidate is AutoSignal => candidate !== null);

  if (candidates.length === 0) {
    return awaiting("Sem estrutura matematica valida no momento.");
  }

  return ready(
    candidates,
    `Gates duros aprovados em ${context.config.ativo}/${context.config.timeframe}; IA pode decidir entre ${candidates.map((candidate) => candidate.type).join(" e ")}.`,
  );
}
