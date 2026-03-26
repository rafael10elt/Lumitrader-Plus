import type { LoadedContext } from "@/lib/backend/supabase";
import type { TradingEventPayload } from "@/lib/backend/types";

type AutoSignal = {
  type: "open_buy" | "open_sell";
  lot: number;
  stopLoss: number;
  takeProfit: number;
  rationale: string;
};

const LOT_STEP = 0.01;
const MIN_AUTO_LOT = 0.01;
const PRICE_VALUE_PER_LOT = 100;

function roundPrice(value: number) {
  return Number(value.toFixed(2));
}

function roundLot(value: number) {
  return Number((Math.floor(value / LOT_STEP) * LOT_STEP).toFixed(2));
}

function computeRiskDistance(entry: number, fallback: number | null | undefined) {
  const structuralDistance = fallback != null ? Math.abs(entry - fallback) : 0;
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

export function evaluateAutoOpportunity(
  context: LoadedContext,
  payload: TradingEventPayload,
  operationsToday: number,
  dailyProfitTotal = 0,
  dailyLossTotal = 0,
): AutoSignal | null {
  if (payload.event !== "account_sync" || !payload.market || !context.config?.sistema_ligado || !context.account.ativo) {
    return null;
  }

  const referenceDate = payload.account.server_time ? new Date(payload.account.server_time) : new Date();
  if (!isWithinTradingWindow(referenceDate, context.config.horario_inicio, context.config.horario_fim)) {
    return null;
  }

  if (context.config.meta_lucro_diaria > 0 && dailyProfitTotal >= context.config.meta_lucro_diaria) {
    return null;
  }

  if (context.config.perda_maxima_diaria > 0 && dailyLossTotal >= context.config.perda_maxima_diaria) {
    return null;
  }

  const hasOpenPositionsInMt5 = (payload.account.open_positions_count ?? 0) > 0
    || (Array.isArray(payload.account.open_position_tickets) && payload.account.open_position_tickets.length > 0);
  if (hasOpenPositionsInMt5) {
    return null;
  }

  const market = payload.market;
  const trend = market.trend;
  const rsi = market.rsi ?? null;
  const movingAverage20 = market.moving_average_20 ?? null;
  const support = market.support ?? null;
  const resistance = market.resistance ?? null;
  const lastBid = market.last_bid ?? null;
  const lastAsk = market.last_ask ?? null;

  if (!trend || rsi == null || movingAverage20 == null || lastBid == null || lastAsk == null) {
    return null;
  }

  if (context.config.limite_operacoes_ativo && context.config.limite_operacoes_diaria != null && operationsToday >= context.config.limite_operacoes_diaria) {
    return null;
  }

  const floatingLoss = Math.max((payload.account.balance ?? 0) - (payload.account.equity ?? 0), 0);
  if (context.config.perda_maxima_diaria > 0 && (dailyLossTotal + floatingLoss) >= context.config.perda_maxima_diaria) {
    return null;
  }

  if (trend === "uptrend" && rsi >= 55 && rsi <= 68 && lastAsk > movingAverage20) {
    const entry = lastAsk;
    const riskDistance = computeRiskDistance(entry, support);
    const stopLoss = roundPrice(support != null && support < entry ? support : entry - riskDistance);
    const takeProfit = roundPrice(resistance != null && resistance > entry ? resistance : entry + riskDistance * 2);
    const lot = computeDynamicLot({
      balance: payload.account.balance ?? 0,
      equity: payload.account.equity ?? payload.account.balance ?? 0,
      dailyLossLimit: context.config.perda_maxima_diaria,
      riskPercent: context.config.risco_por_operacao,
      stopDistance: Math.abs(entry - stopLoss),
    });

    if (lot != null && stopLoss < entry && takeProfit > entry) {
      return {
        type: "open_buy",
        lot,
        stopLoss,
        takeProfit,
        rationale: `Signal uptrend RSI ${rsi.toFixed(1)} above MA20 | risk ${(context.config.risco_por_operacao * 100).toFixed(2)}% | lot ${lot.toFixed(2)}`,
      };
    }
  }

  if (trend === "downtrend" && rsi >= 32 && rsi <= 45 && lastBid < movingAverage20) {
    const entry = lastBid;
    const riskDistance = computeRiskDistance(entry, resistance);
    const stopLoss = roundPrice(resistance != null && resistance > entry ? resistance : entry + riskDistance);
    const takeProfit = roundPrice(support != null && support < entry ? support : entry - riskDistance * 2);
    const lot = computeDynamicLot({
      balance: payload.account.balance ?? 0,
      equity: payload.account.equity ?? payload.account.balance ?? 0,
      dailyLossLimit: context.config.perda_maxima_diaria,
      riskPercent: context.config.risco_por_operacao,
      stopDistance: Math.abs(stopLoss - entry),
    });

    if (lot != null && stopLoss > entry && takeProfit < entry) {
      return {
        type: "open_sell",
        lot,
        stopLoss,
        takeProfit,
        rationale: `Signal downtrend RSI ${rsi.toFixed(1)} below MA20 | risk ${(context.config.risco_por_operacao * 100).toFixed(2)}% | lot ${lot.toFixed(2)}`,
      };
    }
  }

  return null;
}