export type TradingEventPayload = {
  event: "operation_opened" | "operation_closed";
  account: {
    number: string;
    broker?: string;
    server?: string;
    name?: string;
    currency_code?: string;
    currency_symbol?: string;
    balance?: number;
    equity?: number;
    margin?: number;
    free_margin?: number;
    margin_level?: number;
    leverage?: number;
  };
  operation: {
    ticket?: string;
    symbol: string;
    timeframe: string;
    side: "buy" | "sell";
    lot: number;
    entry_price: number;
    exit_price?: number;
    stop_loss?: number;
    take_profit?: number;
    spread?: number;
    volume?: number;
    volatility?: number;
    profit_loss?: number;
    opened_at: string;
    closed_at?: string;
    close_reason?: string;
  };
  session?: {
    mode?: "agressivo" | "conservador";
    breakeven_enabled?: boolean;
    trailing_stop_enabled?: boolean;
    profit_target?: number;
    daily_loss_limit?: number;
    operation_limit_enabled?: boolean;
    operation_limit?: number;
  };
  market?: {
    trend?: string;
    rsi?: number;
    moving_average_20?: number;
    support?: number;
    resistance?: number;
    notes?: string[];
  };
};

export type RiskSnapshot = {
  riskAmount: number;
  rewardAmount: number | null;
  riskRewardRatio: number | null;
  floatingDifference: number;
  spreadCostEstimate: number | null;
  remainingDailyLoss: number | null;
  remainingOperationsToday: number | null;
};

export type ReportPayload = {
  event: TradingEventPayload["event"];
  generatedAt: string;
  user: {
    id: string;
    nome: string | null;
    email: string | null;
    telegram_id: string | null;
  };
  account: {
    id: string;
    number: string;
    broker: string | null;
    currency_code: string;
    currency_symbol: string;
    balance: number;
    equity: number;
    active_license: {
      id: string;
      plan: string;
      expires_at: string;
      status: string;
      value: number;
    };
  };
  operation: TradingEventPayload["operation"];
  risk: RiskSnapshot;
  ai: {
    summary: string;
    request_id: string | null;
    model: string;
  };
  formats: {
    json: string;
    csv: string;
    html: string;
  };
};
