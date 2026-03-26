import type { LoadedContext } from "@/lib/backend/supabase";
import type { TradingEventPayload } from "@/lib/backend/types";

const BASE_AUTO_LOT = 0.1;

type AutoSignal = {
  type: "open_buy" | "open_sell";
  lot: number;
  stopLoss: number;
  takeProfit: number;
  rationale: string;
};

function roundPrice(value: number) {
  return Number(value.toFixed(2));
}

function computeRiskDistance(entry: number, fallback: number | null | undefined) {
  const structuralDistance = fallback != null ? Math.abs(entry - fallback) : 0;
  const minimumDistance = Math.max(entry * 0.001, 2);
  return Math.max(structuralDistance, minimumDistance);
}

export function evaluateAutoOpportunity(
  context: LoadedContext,
  payload: TradingEventPayload,
  operationsToday: number,
): AutoSignal | null {
  if (payload.event !== "account_sync" || !payload.market || !context.config?.sistema_ligado) {
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
  if (context.config.perda_maxima_diaria > 0 && floatingLoss >= context.config.perda_maxima_diaria) {
    return null;
  }

  if (trend === "uptrend" && rsi >= 55 && rsi <= 68 && lastAsk > movingAverage20) {
    const entry = lastAsk;
    const riskDistance = computeRiskDistance(entry, support);
    const stopLoss = roundPrice(support != null && support < entry ? support : entry - riskDistance);
    const takeProfit = roundPrice(resistance != null && resistance > entry ? resistance : entry + riskDistance * 2);

    if (stopLoss < entry && takeProfit > entry) {
      return {
        type: "open_buy",
        lot: BASE_AUTO_LOT,
        stopLoss,
        takeProfit,
        rationale: `Signal uptrend RSI ${rsi.toFixed(1)} above MA20`,
      };
    }
  }

  if (trend === "downtrend" && rsi >= 32 && rsi <= 45 && lastBid < movingAverage20) {
    const entry = lastBid;
    const riskDistance = computeRiskDistance(entry, resistance);
    const stopLoss = roundPrice(resistance != null && resistance > entry ? resistance : entry + riskDistance);
    const takeProfit = roundPrice(support != null && support < entry ? support : entry - riskDistance * 2);

    if (stopLoss > entry && takeProfit < entry) {
      return {
        type: "open_sell",
        lot: BASE_AUTO_LOT,
        stopLoss,
        takeProfit,
        rationale: `Signal downtrend RSI ${rsi.toFixed(1)} below MA20`,
      };
    }
  }

  return null;
}
