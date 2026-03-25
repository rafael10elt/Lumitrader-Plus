import type { RiskSnapshot, TradingEventPayload } from "@/lib/backend/types";

type SessionConfig = {
  daily_loss_limit?: number | null;
  operation_limit_enabled?: boolean | null;
  operation_limit?: number | null;
};

export function calculateRiskSnapshot(input: {
  payload: TradingEventPayload;
  balance: number;
  equity: number;
  operationsToday: number;
  sessionConfig?: SessionConfig | null;
}): RiskSnapshot {
  const { payload, balance, equity, operationsToday, sessionConfig } = input;
  const operation = payload.operation;
  const stopDistance = operation.stop_loss ? Math.abs(operation.entry_price - operation.stop_loss) : null;
  const targetDistance = operation.take_profit ? Math.abs(operation.take_profit - operation.entry_price) : null;
  const riskAmount = stopDistance ? stopDistance * operation.lot * 100 : 0;
  const rewardAmount = targetDistance ? targetDistance * operation.lot * 100 : null;
  const riskRewardRatio = riskAmount > 0 && rewardAmount !== null ? rewardAmount / riskAmount : null;
  const floatingDifference = equity - balance;
  const spreadCostEstimate = operation.spread ? operation.spread * operation.lot * 10 : null;
  const remainingDailyLoss = typeof sessionConfig?.daily_loss_limit === "number"
    ? Math.max(sessionConfig.daily_loss_limit - Math.max(0, Math.abs(Math.min(operation.profit_loss ?? 0, 0))), 0)
    : null;
  const remainingOperationsToday = sessionConfig?.operation_limit_enabled && typeof sessionConfig.operation_limit === "number"
    ? Math.max(sessionConfig.operation_limit - operationsToday, 0)
    : null;

  return {
    riskAmount,
    rewardAmount,
    riskRewardRatio,
    floatingDifference,
    spreadCostEstimate,
    remainingDailyLoss,
    remainingOperationsToday,
  };
}
