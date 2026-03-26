import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportPayload, TradingEventPayload } from "@/lib/backend/types";

export type LoadedContext = {
  user: {
    id: string;
    nome: string | null;
    email: string | null;
    telegram_id: string | null;
    acesso_ativo: boolean;
  };
  account: {
    id: string;
    user_id: string;
    nome_cliente: string;
    numero_conta: string;
    corretora: string | null;
    servidor: string | null;
    moeda_codigo: string;
    moeda_simbolo: string;
    saldo_atual: number;
    equity: number;
    margem: number | null;
    margem_livre: number | null;
    nivel_margem: number | null;
    alavancagem: number | null;
    ativo: boolean;
  };
  license: {
    id: string;
    nome_plano: string;
    status: string;
    valor: number;
    data_expiracao: string;
  };
  config: {
    id: string;
    sistema_ligado: boolean;
    modo: "agressivo" | "conservador";
    timeframe: string;
    breakeven_ativo: boolean;
    trailing_stop_ativo: boolean;
    meta_lucro_diaria: number;
    perda_maxima_diaria: number;
    limite_operacoes_ativo: boolean;
    limite_operacoes_diaria: number | null;
    ativo: string;
  } | null;
};

export async function loadSyncContext(accountNumber: string): Promise<Pick<LoadedContext, "user" | "account" | "license">> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("contas_trading")
    .select(`
      id,
      user_id,
      nome_cliente,
      numero_conta,
      corretora,
      servidor,
      moeda_codigo,
      moeda_simbolo,
      saldo_atual,
      equity,
      margem,
      margem_livre,
      nivel_margem,
      alavancagem,
      ativo,
      usuarios!inner(id, nome, email, telegram_id, acesso_ativo),
      licencas!inner(id, nome_plano, status, valor, data_expiracao)
    `)
    .eq("numero_conta", accountNumber)
    .eq("licencas.status", "ativa")
    .gte("licencas.data_expiracao", new Date().toISOString().slice(0, 10))
    .maybeSingle();

  if (error || !data) {
    throw new Error("Conta MT5 nao encontrada ou sem licenca ativa.");
  }

  const user = Array.isArray(data.usuarios) ? data.usuarios[0] : data.usuarios;
  const license = Array.isArray(data.licencas) ? data.licencas[0] : data.licencas;

  if (!user || !license) {
    throw new Error("Conta MT5 sem usuario/licenca valida.");
  }

  return {
    user,
    license,
    account: {
      id: data.id,
      user_id: data.user_id,
      nome_cliente: data.nome_cliente,
      numero_conta: data.numero_conta,
      corretora: data.corretora,
      servidor: data.servidor,
      moeda_codigo: data.moeda_codigo,
      moeda_simbolo: data.moeda_simbolo,
      saldo_atual: data.saldo_atual,
      equity: data.equity,
      margem: data.margem,
      margem_livre: data.margem_livre,
      nivel_margem: data.nivel_margem,
      alavancagem: data.alavancagem,
      ativo: data.ativo,
    },
  };
}

export async function loadTradingContext(accountNumber: string): Promise<LoadedContext> {
  const adminClient = createAdminClient();
  const { data: account, error: accountError } = await adminClient
    .from("contas_trading")
    .select("id, user_id, nome_cliente, numero_conta, corretora, servidor, moeda_codigo, moeda_simbolo, saldo_atual, equity, margem, margem_livre, nivel_margem, alavancagem, ativo")
    .eq("numero_conta", accountNumber)
    .maybeSingle<LoadedContext["account"]>();

  if (accountError || !account) {
    throw new Error("Conta MT5 nao encontrada.");
  }

  const [{ data: user }, { data: license }, { data: config }] = await Promise.all([
    adminClient
      .from("usuarios")
      .select("id, nome, email, telegram_id, acesso_ativo")
      .eq("id", account.user_id)
      .single<LoadedContext["user"]>(),
    adminClient
      .from("licencas")
      .select("id, nome_plano, status, valor, data_expiracao")
      .eq("conta_trading_id", account.id)
      .maybeSingle<LoadedContext["license"]>(),
    adminClient
      .from("configuracoes_sessao")
      .select("id, sistema_ligado, modo, timeframe, breakeven_ativo, trailing_stop_ativo, meta_lucro_diaria, perda_maxima_diaria, limite_operacoes_ativo, limite_operacoes_diaria, ativo")
      .eq("conta_trading_id", account.id)
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle<LoadedContext["config"]>(),
  ]);

  if (!user) {
    throw new Error("Usuario da conta nao encontrado.");
  }

  if (!license) {
    throw new Error("Nenhuma licenca vinculada a esta conta.");
  }

  return { user, account, license, config };
}

export async function updateAccountSnapshot(accountId: string, payload: TradingEventPayload, insightSummary?: string | null) {
  const adminClient = createAdminClient();
  await adminClient
    .from("contas_trading")
    .update({
      nome_cliente: payload.account.name ?? undefined,
      corretora: payload.account.broker ?? undefined,
      servidor: payload.account.server ?? undefined,
      moeda_codigo: payload.account.currency_code ?? undefined,
      moeda_simbolo: payload.account.currency_symbol ?? undefined,
      saldo_atual: payload.account.balance ?? undefined,
      equity: payload.account.equity ?? undefined,
      margem: payload.account.margin ?? undefined,
      margem_livre: payload.account.free_margin ?? undefined,
      nivel_margem: payload.account.margin_level ?? undefined,
      alavancagem: payload.account.leverage ?? undefined,
      server_time: payload.account.server_time ?? null,
      mercado_snapshot: payload.market ?? null,
      insight_atual: insightSummary ?? undefined,
      ultima_sincronizacao: new Date().toISOString(),
      ativo: true,
    })
    .eq("id", accountId);
}

export async function recordTradingEvent(context: LoadedContext, payload: TradingEventPayload) {
  const adminClient = createAdminClient();

  if (!payload.operation) {
    return null;
  }

  if (payload.event === "operation_opened") {
    const { data: inserted } = await adminClient
      .from("operacoes")
      .insert({
        user_id: context.user.id,
        conta_trading_id: context.account.id,
        ativo: payload.operation.symbol,
        timeframe: payload.operation.timeframe,
        direcao: payload.operation.side === "buy" ? "compra" : "venda",
        status: "aberta",
        lote: payload.operation.lot,
        preco_entrada: payload.operation.entry_price,
        stop_loss: payload.operation.stop_loss ?? null,
        take_profit: payload.operation.take_profit ?? null,
        spread: payload.operation.spread ?? null,
        volume: payload.operation.volume ?? null,
        volatilidade: payload.operation.volatility ?? null,
        be_ativo: payload.session?.breakeven_enabled ?? context.config?.breakeven_ativo ?? false,
        ts_ativo: payload.session?.trailing_stop_enabled ?? context.config?.trailing_stop_ativo ?? false,
        validacao_ia: {
          ticket: payload.operation.ticket ?? null,
          market: payload.market ?? null,
        },
        aberta_em: payload.operation.opened_at,
      })
      .select("id")
      .single<{ id: string }>();

    return inserted?.id ?? null;
  }

  let latestOpen: { id: string; validacao_ia?: Record<string, unknown> | null } | null = null;

  if (payload.operation.ticket) {
    const { data: ticketMatchedOpen } = await adminClient
      .from("operacoes")
      .select("id, validacao_ia")
      .eq("conta_trading_id", context.account.id)
      .eq("status", "aberta")
      .contains("validacao_ia", { ticket: payload.operation.ticket })
      .order("aberta_em", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; validacao_ia?: Record<string, unknown> | null }>();

    latestOpen = ticketMatchedOpen ?? null;
  }

  if (!latestOpen) {
    const { data: symbolMatchedOpen } = await adminClient
      .from("operacoes")
      .select("id, validacao_ia")
      .eq("conta_trading_id", context.account.id)
      .eq("status", "aberta")
      .eq("ativo", payload.operation.symbol)
      .order("aberta_em", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; validacao_ia?: Record<string, unknown> | null }>();

    latestOpen = symbolMatchedOpen ?? null;
  }

  if (latestOpen?.id) {
    const currentTelemetry = latestOpen.validacao_ia && typeof latestOpen.validacao_ia === "object"
      ? latestOpen.validacao_ia
      : {};

    if (payload.event === "operation_partially_closed") {
      const partialCloses = Array.isArray(currentTelemetry.partial_closes)
        ? currentTelemetry.partial_closes
        : [];

      await adminClient
        .from("operacoes")
        .update({
          lote: payload.operation.lot,
          stop_loss: payload.operation.stop_loss ?? null,
          take_profit: payload.operation.take_profit ?? null,
          lucro_prejuizo: payload.operation.profit_loss ?? 0,
          spread: payload.operation.spread ?? null,
          volume: payload.operation.volume ?? null,
          volatilidade: payload.operation.volatility ?? null,
          validacao_ia: {
            ...currentTelemetry,
            ticket: payload.operation.ticket ?? currentTelemetry.ticket ?? null,
            market: payload.market ?? currentTelemetry.market ?? null,
            partial_closes: [
              ...partialCloses.slice(-9),
              {
                closed_at: payload.operation.closed_at ?? new Date().toISOString(),
                exit_price: payload.operation.exit_price ?? null,
                close_reason: payload.operation.close_reason ?? "partial_close",
                remaining_lot: payload.operation.lot,
              },
            ],
          },
        })
        .eq("id", latestOpen.id);

      return latestOpen.id;
    }

    await adminClient
      .from("operacoes")
      .update({
        status: "fechada",
        preco_saida: payload.operation.exit_price ?? null,
        lucro_prejuizo: payload.operation.profit_loss ?? 0,
        motivo_fechamento: payload.operation.close_reason ?? null,
        fechada_em: payload.operation.closed_at ?? new Date().toISOString(),
        spread: payload.operation.spread ?? null,
        volume: payload.operation.volume ?? null,
        volatilidade: payload.operation.volatility ?? null,
        validacao_ia: {
          ...currentTelemetry,
          ticket: payload.operation.ticket ?? currentTelemetry.ticket ?? null,
          market: payload.market ?? currentTelemetry.market ?? null,
        },
      })
      .eq("id", latestOpen.id);

    return latestOpen.id;
  }

  const { data: inserted } = await adminClient
    .from("operacoes")
    .insert({
      user_id: context.user.id,
      conta_trading_id: context.account.id,
      ativo: payload.operation.symbol,
      timeframe: payload.operation.timeframe,
      direcao: payload.operation.side === "buy" ? "compra" : "venda",
      status: payload.event === "operation_partially_closed" ? "aberta" : "fechada",
      lote: payload.operation.lot,
      preco_entrada: payload.operation.entry_price,
      preco_saida: payload.event === "operation_partially_closed" ? null : (payload.operation.exit_price ?? null),
      stop_loss: payload.operation.stop_loss ?? null,
      take_profit: payload.operation.take_profit ?? null,
      lucro_prejuizo: payload.operation.profit_loss ?? 0,
      spread: payload.operation.spread ?? null,
      volume: payload.operation.volume ?? null,
      volatilidade: payload.operation.volatility ?? null,
      be_ativo: payload.session?.breakeven_enabled ?? context.config?.breakeven_ativo ?? false,
      ts_ativo: payload.session?.trailing_stop_enabled ?? context.config?.trailing_stop_ativo ?? false,
      validacao_ia: {
        ticket: payload.operation.ticket ?? null,
        market: payload.market ?? null,
      },
      motivo_fechamento: payload.event === "operation_partially_closed" ? null : (payload.operation.close_reason ?? null),
      aberta_em: payload.operation.opened_at,
      fechada_em: payload.event === "operation_partially_closed" ? null : (payload.operation.closed_at ?? new Date().toISOString()),
    })
    .select("id")
    .single<{ id: string }>();

  return inserted?.id ?? null;
}

export async function attachOperationTelemetry(operationId: string | null, payload: TradingEventPayload, report: Omit<ReportPayload, "formats">) {
  if (!operationId || !payload.operation) {
    return;
  }

  const adminClient = createAdminClient();
  const { data: existing } = await adminClient
    .from("operacoes")
    .select("validacao_ia")
    .eq("id", operationId)
    .maybeSingle<{ validacao_ia?: Record<string, unknown> | null }>();

  const currentTelemetry = existing?.validacao_ia && typeof existing.validacao_ia === "object"
    ? existing.validacao_ia
    : {};

  await adminClient
    .from("operacoes")
    .update({
      validacao_ia: {
        ...currentTelemetry,
        ticket: payload.operation.ticket ?? currentTelemetry.ticket ?? null,
        market: payload.market ?? currentTelemetry.market ?? null,
        ai: report.ai,
        report_generated_at: report.generatedAt,
      },
    })
    .eq("id", operationId);
}
export async function countOperationsToday(accountId: string) {
  const adminClient = createAdminClient();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { count } = await adminClient
    .from("operacoes")
    .select("id", { count: "exact", head: true })
    .eq("conta_trading_id", accountId)
    .gte("aberta_em", start.toISOString());

  return count ?? 0;
}

export async function refreshDailyStats(context: LoadedContext, payload: TradingEventPayload) {
  if (!payload.operation) {
    return;
  }

  const adminClient = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: operations } = await adminClient
    .from("operacoes")
    .select("lucro_prejuizo")
    .eq("conta_trading_id", context.account.id)
    .gte("aberta_em", `${today}T00:00:00.000Z`)
    .lte("aberta_em", `${today}T23:59:59.999Z`);

  const normalized = operations ?? [];
  const profits = normalized.map((item) => Number(item.lucro_prejuizo ?? 0));
  const wins = profits.filter((value) => value > 0).length;
  const losses = profits.filter((value) => value < 0).length;
  const best = profits.length ? Math.max(...profits) : 0;
  const worst = profits.length ? Math.min(...profits) : 0;
  const profitTotal = profits.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const lossTotal = profits.filter((value) => value < 0).reduce((sum, value) => sum + Math.abs(value), 0);
  const drawdown = context.account.saldo_atual ? Number(((lossTotal / Math.max(context.account.saldo_atual, 1)) * 100).toFixed(2)) : 0;

  await adminClient.from("estatisticas").upsert({
    user_id: context.user.id,
    conta_trading_id: context.account.id,
    ativo: payload.operation.symbol,
    periodo: today,
    operacoes_total: normalized.length,
    vitorias: wins,
    derrotas: losses,
    win_rate: normalized.length ? Number(((wins / normalized.length) * 100).toFixed(2)) : 0,
    lucro_total: profitTotal,
    prejuizo_total: lossTotal,
    drawdown,
    melhor_operacao: best,
    pior_operacao: worst,
  }, {
    onConflict: "user_id,conta_trading_id,ativo,periodo",
  });
}



export async function reconcileOpenOperations(accountId: string, openPositionTickets: string[]) {
  const adminClient = createAdminClient();
  const normalizedTickets = openPositionTickets
    .filter((ticket) => typeof ticket === "string" && ticket.length > 0)
    .map((ticket) => ticket.trim());

  const { data: openRows } = await adminClient
    .from("operacoes")
    .select("id, validacao_ia")
    .eq("conta_trading_id", accountId)
    .eq("status", "aberta");

  const staleOperationIds = (openRows ?? [])
    .filter((row) => {
      const ticket = row.validacao_ia && typeof row.validacao_ia === "object" && typeof row.validacao_ia.ticket === "string"
        ? row.validacao_ia.ticket
        : null;
      return !ticket || !normalizedTickets.includes(ticket);
    })
    .map((row) => row.id);

  if (staleOperationIds.length === 0) {
    return;
  }

  await adminClient
    .from("operacoes")
    .update({
      status: "fechada",
      fechada_em: new Date().toISOString(),
      motivo_fechamento: "mt5_sync_reconcile",
    })
    .in("id", staleOperationIds);
}
export async function loadAccountExecutionState(accountId: string) {
  const adminClient = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [{ count: openPositions }, { count: pendingCommands }] = await Promise.all([
    adminClient
      .from("operacoes")
      .select("id", { count: "exact", head: true })
      .eq("conta_trading_id", accountId)
      .eq("status", "aberta"),
    adminClient
      .from("comandos_trading")
      .select("id", { count: "exact", head: true })
      .eq("conta_trading_id", accountId)
      .in("status", ["pending", "processing"])
      .gte("solicitado_em", today.toISOString()),
  ]);

  return {
    hasOpenPosition: (openPositions ?? 0) > 0,
    hasPendingCommand: (pendingCommands ?? 0) > 0,
  };
}

export async function enqueueAutoTradeCommand(
  context: LoadedContext,
  payload: TradingEventPayload,
  signal: {
    type: "open_buy" | "open_sell";
    lot: number;
    stopLoss: number;
    takeProfit: number;
    rationale: string;
  },
) {
  const adminClient = createAdminClient();
  const { error } = await adminClient.from("comandos_trading").insert({
    user_id: context.user.id,
    conta_trading_id: context.account.id,
    ativo: payload.operation?.symbol ?? context.config?.ativo ?? "XAUUSD",
    timeframe: payload.operation?.timeframe ?? context.config?.timeframe ?? "M5",
    tipo: signal.type,
    lote: signal.lot,
    stop_loss: signal.stopLoss,
    take_profit: signal.takeProfit,
    payload: {
      origem: "auto_signal",
      rationale: signal.rationale,
      market: payload.market ?? null,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}





