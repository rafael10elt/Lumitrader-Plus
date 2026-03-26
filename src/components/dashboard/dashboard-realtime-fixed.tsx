"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { AppUser } from "@/lib/auth";
import {
  saveTradingSettings,
  submitBuyCommand,
  submitCloseCommand,
  submitPartialCloseCommand,
  submitSellCommand,
  toggleSystemState,
} from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import { TradingViewChart } from "@/components/dashboard/tradingview-chart";
import type {
  DashboardAccount,
  DashboardCommandStatus,
  DashboardConfig,
  DashboardHistoryFilters,
  DashboardHistoryRow,
  DashboardInsightBundle,
  DashboardLicense,
  DashboardOpenOperation,
  DashboardStats,
} from "@/app/dashboard/page";

type SelectableAccount = DashboardAccount & { license: DashboardLicense };

type DashboardRealtimeProps = {
  profile: AppUser;
  accounts: SelectableAccount[];
  selectedAccountId: string;
  selectedLicense: DashboardLicense;
  account: DashboardAccount;
  config: DashboardConfig;
  stats: DashboardStats;
  history: DashboardHistoryRow[];
  historyFilters: DashboardHistoryFilters;
  insightBundle: DashboardInsightBundle;
  openOperation: DashboardOpenOperation | null;
  commandStatuses: DashboardCommandStatus[];
};

type ToastTone = "success" | "error" | "info";

type DashboardToast = {
  id: number;
  title: string;
  tone: ToastTone;
  detail?: string;
};

const RELOAD_TOAST_KEY = "lumitrader-dashboard-toast";

function formatAccountCurrency(value: number, account: DashboardAccount) {
  const currencyCode = account.moeda_codigo?.toUpperCase?.() || "USD";
  const locale = currencyCode === "BRL" ? "pt-BR" : currencyCode === "EUR" ? "de-DE" : "en-US";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${account.moeda_simbolo} ${value.toFixed(2)}`;
  }
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T00:00:00`));
}

function formatDateTime(date: string | null) {
  if (!date) return "Aguardando primeira leitura";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(date));
}

function formatTimeRange(start: string, end: string) {
  return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
}

function commandLabel(command: DashboardCommandStatus | null) {
  if (!command) return "Sem comandos recentes";
  if (command.status === "pending") return "Na fila";
  if (command.status === "processing") return "Executando na VPS";
  if (command.status === "executed") return "Executado";
  if (command.status === "failed") return "Falhou";
  return "Cancelado";
}

function commandTone(command: DashboardCommandStatus | null) {
  if (!command) return "text-slate-300";
  if (command.status === "executed") return "text-lime-300";
  if (command.status === "failed") return "text-red-300";
  return "text-amber-200";
}

export function DashboardRealtimeFixed({
  profile,
  accounts,
  selectedAccountId,
  selectedLicense,
  account,
  config,
  stats,
  history,
  historyFilters,
  insightBundle,
  openOperation,
  commandStatuses,
}: DashboardRealtimeProps) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [liveAccount, setLiveAccount] = useState(account);
  const [liveConfig, setLiveConfig] = useState(config);
  const [liveStats, setLiveStats] = useState(stats);
  const [liveHistory, setLiveHistory] = useState(history);
  const [liveNow, setLiveNow] = useState<Date | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [liveInsightBundle, setLiveInsightBundle] = useState(insightBundle);
  const [liveOpenOperation, setLiveOpenOperation] = useState(openOperation);
  const [liveCommandStatuses, setLiveCommandStatuses] = useState(commandStatuses);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const refreshInFlightRef = useRef(false);
  const queuedRefreshRef = useRef(false);

  useEffect(() => {
    setLiveAccount(account);
    setLiveConfig(config);
    setLiveStats(stats);
    setLiveHistory(history);
    setLiveInsightBundle(insightBundle);
    setLiveOpenOperation(openOperation);
    setLiveCommandStatuses(commandStatuses);
  }, [account, commandStatuses, config, history, insightBundle, openOperation, stats]);

  const pushToast = useEffectEvent((title: string, tone: ToastTone, detail?: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, title, tone, detail }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  });

  const persistReloadToast = useEffectEvent((title: string, tone: ToastTone, detail?: string) => {
    window.sessionStorage.setItem(RELOAD_TOAST_KEY, JSON.stringify({ title, tone, detail }));
  });

  const refreshSnapshot = useEffectEvent(async () => {
    if (refreshInFlightRef.current) {
      queuedRefreshRef.current = true;
      return;
    }

    refreshInFlightRef.current = true;

    try {
      const [
        { data: nextAccount },
        { data: nextConfig },
        { data: nextRiskConfigs },
        { data: nextStats },
        { data: nextOperations },
        { data: nextCommands },
      ] = await Promise.all([
        supabase.from("contas_trading").select("id, user_id, nome_cliente, numero_conta, corretora, moeda_codigo, moeda_simbolo, saldo_atual, equity, margem_livre, nivel_margem, ativo, atualizado_em, server_time, mercado_snapshot, insight_atual, ultima_sincronizacao").eq("id", selectedAccountId).maybeSingle<DashboardAccount>(),
        supabase.from("configuracoes_sessao").select("id, conta_trading_id, ativo, timeframe, sistema_ligado, modo, breakeven_ativo, trailing_stop_ativo, horario_inicio, horario_fim, meta_lucro_diaria, perda_maxima_diaria, limite_operacoes_ativo, limite_operacoes_diaria").eq("conta_trading_id", selectedAccountId).order("atualizado_em", { ascending: false }).limit(1).maybeSingle<Omit<DashboardConfig, "risco_por_operacao">>(),
        supabase.from("ativos_config").select("ativo, timeframe, risco_por_operacao, ativo_principal").eq("conta_trading_id", selectedAccountId).order("ativo_principal", { ascending: false }).order("atualizado_em", { ascending: false }),
        supabase.from("estatisticas").select("conta_trading_id, operacoes_total, vitorias, derrotas, win_rate, lucro_total, prejuizo_total, drawdown, melhor_operacao, pior_operacao").eq("conta_trading_id", selectedAccountId).order("periodo", { ascending: false }).limit(1).maybeSingle<DashboardStats>(),
        supabase.from("operacoes").select("id, direcao, status, lote, preco_entrada, preco_saida, stop_loss, take_profit, lucro_prejuizo, aberta_em, fechada_em, timeframe, ativo, validacao_ia").eq("conta_trading_id", selectedAccountId).order("aberta_em", { ascending: false }).limit(50),
        supabase.from("comandos_trading").select("id, tipo, status, erro, solicitado_em, processado_em, payload").eq("conta_trading_id", selectedAccountId).order("solicitado_em", { ascending: false }).limit(5),
      ]);

      startTransition(() => {
        if (nextAccount) {
          setLiveAccount(nextAccount);
          const snapshotNotes = Array.isArray(nextAccount.mercado_snapshot?.notes) ? nextAccount.mercado_snapshot.notes : [];
          const snapshotCandles = Array.isArray(nextAccount.mercado_snapshot?.candles) ? nextAccount.mercado_snapshot.candles : [];
          setLiveInsightBundle((current) => ({
            summary: nextAccount.insight_atual ?? current.summary,
            notes: snapshotNotes.length > 0 ? snapshotNotes : current.notes,
            candles: snapshotCandles.length > 0 ? snapshotCandles : current.candles,
          }));
        }

        if (nextConfig) {
          const normalizedRiskConfigs = (nextRiskConfigs ?? []) as Array<{ ativo: string; timeframe: string; risco_por_operacao: number; ativo_principal: boolean }>;
          const matchedRiskConfig = normalizedRiskConfigs.find((item) => item.ativo === nextConfig.ativo && item.timeframe === nextConfig.timeframe)
            ?? normalizedRiskConfigs.find((item) => item.ativo === nextConfig.ativo)
            ?? normalizedRiskConfigs[0];
          setLiveConfig({
            ...nextConfig,
            risco_por_operacao: Number(matchedRiskConfig?.risco_por_operacao ?? liveConfig.risco_por_operacao ?? 0.01),
          });
        }
        if (nextStats) setLiveStats(nextStats);

        if (nextOperations) {
          const nextOpenOperation = nextOperations.find((operation) => operation.status === "aberta" && !operation.fechada_em);
          setLiveOpenOperation(
            nextOpenOperation
              ? {
                  id: nextOpenOperation.id,
                  ticket: typeof nextOpenOperation.validacao_ia?.ticket === "string" ? nextOpenOperation.validacao_ia.ticket : null,
                  direction: nextOpenOperation.direcao === "compra" ? "buy" : "sell",
                  lot: Number(nextOpenOperation.lote),
                  entryPrice: Number(nextOpenOperation.preco_entrada),
                  stopLoss: nextOpenOperation.stop_loss != null ? Number(nextOpenOperation.stop_loss) : null,
                  takeProfit: nextOpenOperation.take_profit != null ? Number(nextOpenOperation.take_profit) : null,
                  openedAt: nextOpenOperation.aberta_em,
                  timeframe: nextOpenOperation.timeframe,
                  symbol: nextOpenOperation.ativo,
                  profitLoss: Number(nextOpenOperation.lucro_prejuizo ?? 0),
                }
              : null,
          );

          const nextRows: Array<DashboardHistoryRow | null> = nextOperations.map((operation) => {
            if (operation.status === "aberta") return null;
            const resultValue = Number(operation.lucro_prejuizo ?? 0);
            return {
              id: operation.id,
              time: new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(operation.fechada_em ?? operation.aberta_em)),
              type: operation.direcao === "compra" ? "Compra" : "Venda",
              lot: Number(operation.lote).toFixed(2),
              entry: Number(operation.preco_entrada).toFixed(2),
              result: `${resultValue >= 0 ? "+" : "-"}${Math.abs(resultValue).toFixed(2)}`,
              resultTone: resultValue >= 0 ? "text-lime-400" : "text-red-400",
            };
          });

          setLiveHistory(nextRows.filter((row): row is DashboardHistoryRow => row !== null));

          const latestTelemetry = nextOperations.find((operation) => operation.validacao_ia);
          if (latestTelemetry?.validacao_ia) {
            setLiveInsightBundle((current) => ({
              summary: typeof latestTelemetry.validacao_ia.ai?.summary === "string" ? latestTelemetry.validacao_ia.ai.summary : current.summary,
              notes: Array.isArray(latestTelemetry.validacao_ia.market?.notes) ? latestTelemetry.validacao_ia.market.notes : current.notes,
              candles: Array.isArray(latestTelemetry.validacao_ia.market?.candles) ? latestTelemetry.validacao_ia.market.candles : current.candles,
            }));
          }
        }

        if (nextCommands) setLiveCommandStatuses(nextCommands as DashboardCommandStatus[]);
      });
    } finally {
      refreshInFlightRef.current = false;
      if (queuedRefreshRef.current) {
        queuedRefreshRef.current = false;
        void refreshSnapshot();
      }
    }
  });

  useEffect(() => {
    setHasMounted(true);
    setLiveNow(new Date());

    const storedToast = window.sessionStorage.getItem(RELOAD_TOAST_KEY);
    if (storedToast) {
      window.sessionStorage.removeItem(RELOAD_TOAST_KEY);
      try {
        const parsed = JSON.parse(storedToast) as { title?: string; tone?: ToastTone; detail?: string };
        if (parsed.title && parsed.tone) {
          pushToast(parsed.title, parsed.tone, parsed.detail);
        }
      } catch {
        // ignore invalid storage payloads
      }
    }

    const interval = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [pushToast]);

  useEffect(() => {
    const channel = supabase
      .channel(`lumitrader-account-${selectedAccountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contas_trading", filter: `id=eq.${selectedAccountId}` }, () => { void refreshSnapshot(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "configuracoes_sessao", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => { void refreshSnapshot(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "estatisticas", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => { void refreshSnapshot(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "operacoes", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => { void refreshSnapshot(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "licencas", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => { void refreshSnapshot(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "comandos_trading", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => { void refreshSnapshot(); })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshSnapshot, selectedAccountId, supabase]);

  useEffect(() => {
    const requestRefresh = () => {
      void refreshSnapshot();
    };

    requestRefresh();

    const interval = window.setInterval(requestRefresh, 2500);
    const handleFocus = () => requestRefresh();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestRefresh();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshSnapshot, selectedAccountId]);

  const runAction = useEffectEvent(async (action: (formData: FormData) => Promise<void>, formData: FormData, successTitle: string, successDetail?: string) => {
    setIsSubmitting(true);
    try {
      await action(formData);
      await refreshSnapshot();
      pushToast(successTitle, "success", successDetail);
    } catch (error) {
      pushToast("Acao nao concluida", "error", error instanceof Error ? error.message : "Nao foi possivel completar a solicitacao.");
    } finally {
      setIsSubmitting(false);
    }
  });

  const handleAccountChange = useEffectEvent((value: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("account", value);
    params.delete("from");
    params.delete("to");
    params.delete("type");
    params.delete("result");
    persistReloadToast("Conta alterada", "info", "Carregando os dados da conta selecionada.");
    window.location.assign(`/dashboard?${params.toString()}`);
  });

  const handleFilterSubmit = useEffectEvent((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams(window.location.search);
    params.set("account", selectedAccountId);

    const from = typeof formData.get("from") === "string" ? String(formData.get("from")) : "";
    const to = typeof formData.get("to") === "string" ? String(formData.get("to")) : "";
    const type = typeof formData.get("type") === "string" ? String(formData.get("type")) : "all";
    const result = typeof formData.get("result") === "string" ? String(formData.get("result")) : "all";

    if (from) params.set("from", from); else params.delete("from");
    if (to) params.set("to", to); else params.delete("to");
    if (type && type !== "all") params.set("type", type); else params.delete("type");
    if (result && result !== "all") params.set("result", result); else params.delete("result");

    persistReloadToast("Timeline atualizada", "info", "Aplicando os filtros operacionais.");
    router.push(`/dashboard?${params.toString()}`);
  });

  const handleToggleSubmit = useEffectEvent((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAction(toggleSystemState, new FormData(event.currentTarget), liveConfig.sistema_ligado ? "Automacao pausada" : "Automacao armada", liveConfig.sistema_ligado ? "O sistema foi colocado em pausa." : "A conta esta pronta para operar automaticamente.");
  });

  const handleSettingsSubmit = useEffectEvent((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runAction(saveTradingSettings, new FormData(event.currentTarget), "Parametros salvos", "As configuracoes operacionais foram atualizadas.");
  });

  const handleManualSubmit = useEffectEvent((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitEvent = event.nativeEvent as SubmitEvent;
    const submitter = submitEvent.submitter as HTMLButtonElement | null;
    const tradeAction = submitter?.dataset.tradeAction;
    const formData = new FormData(event.currentTarget);

    if (tradeAction === "buy") {
      void runAction(submitBuyCommand, formData, "Compra enviada", "A ordem de compra entrou na fila do bridge MT5.");
      return;
    }

    if (tradeAction === "sell") {
      void runAction(submitSellCommand, formData, "Venda enviada", "A ordem de venda entrou na fila do bridge MT5.");
      return;
    }

    if (tradeAction === "partial") {
      void runAction(submitPartialCloseCommand, formData, "Parcial enviada", "O fechamento parcial foi enviado para a VPS.");
      return;
    }

    if (tradeAction === "close") {
      void runAction(submitCloseCommand, formData, "Fechamento enviado", "O encerramento da posicao foi enviado para a VPS.");
    }
  });

  const floatingProfit = (liveAccount.equity ?? 0) - (liveAccount.saldo_atual ?? 0);
  const isSystemOnline = liveConfig.sistema_ligado && Boolean(liveAccount.ativo);
  const latestCommand = liveCommandStatuses[0] ?? null;
  const latestCommandStatus = commandLabel(latestCommand);
  const latestCommandTone = commandTone(latestCommand);
  const brasiliaClockLabel = hasMounted && liveNow
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "America/Sao_Paulo",
      }).format(liveNow)
    : "Sincronizando relogio...";

  const metrics = [
    { label: "Lucro do Dia", value: formatAccountCurrency(Math.max(liveStats.lucro_total, 0), liveAccount), tone: "text-lime-400" },
    { label: "Perda do Dia", value: `-${formatAccountCurrency(Math.abs(liveStats.prejuizo_total), liveAccount)}`, tone: "text-red-400" },
    { label: "Win Rate", value: `${liveStats.win_rate}%`, tone: "text-white" },
    { label: "Drawdown", value: `${liveStats.drawdown}%`, tone: "text-white" },
  ];

  const marketSnapshot = (liveAccount.mercado_snapshot ?? {}) as {
    notes?: string[];
    candles?: DashboardInsightBundle["candles"];
    trend?: string | null;
    rsi?: number | null;
    moving_average_20?: number | null;
    support?: number | null;
    resistance?: number | null;
    open_positions_count?: number | null;
    open_position_tickets?: string[];
    automation_status?: string | null;
    automation_reason?: string | null;
    automation_updated_at?: string | null;
  };

  const openPositionTickets = Array.isArray(marketSnapshot.open_position_tickets)
    ? marketSnapshot.open_position_tickets.filter((ticket): ticket is string => typeof ticket === "string" && ticket.length > 0)
    : [];
  const syncedOpenPositionsCount = typeof marketSnapshot.open_positions_count === "number"
    ? marketSnapshot.open_positions_count
    : openPositionTickets.length;
  const fallbackOpenTicket = liveOpenOperation?.ticket ?? (openPositionTickets.length === 1 ? openPositionTickets[0] : null);
  const automationStatus = typeof marketSnapshot.automation_status === "string" ? marketSnapshot.automation_status : "idle";
  const automationReason = typeof marketSnapshot.automation_reason === "string" ? marketSnapshot.automation_reason : "Sem diagnostico recente da automacao.";
  const hasDetectedOpenPosition = Boolean(liveOpenOperation) || syncedOpenPositionsCount > 0 || openPositionTickets.length > 0;
  const canManageOpenPosition = Boolean(fallbackOpenTicket) && !isSubmitting;

  return (
    <>
      <div className="mt-3 grid min-w-0 gap-3">
        <section className="glass-panel rounded-[24px] p-3">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1.3fr)_repeat(7,minmax(0,0.78fr))]">
              <label className="grid gap-1 rounded-[16px] border border-white/8 bg-slate-950/35 px-3 py-2.5">
                <span className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Conta ativa</span>
                <select
                  name="account"
                  value={selectedAccountId}
                  onChange={(event) => handleAccountChange(event.currentTarget.value)}
                  className="min-w-0 rounded-[12px] border border-white/10 bg-slate-950/70 px-3 py-1.5 text-sm text-white outline-none"
                >
                  {accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {`${item.numero_conta} - ${item.nome_cliente} - expira ${formatDate(item.license.data_expiracao)}`}
                    </option>
                  ))}
                </select>
              </label>
              <TopMetric label="Brasilia" value={brasiliaClockLabel} />
              <TopMetric label="Servidor" value={formatDateTime(liveAccount.server_time)} />
              <TopMetric label="Canal MT5" value={latestCommandStatus} tone={latestCommandTone} />
              <HeaderPill label="Status" value={isSystemOnline ? "ONLINE" : "PAUSADO"} online={isSystemOnline} />
              <HeaderPill label="Modo" value={liveConfig.modo === "agressivo" ? "Agressivo" : "Conservador"} />
              <HeaderPill label="Licenca" value={selectedLicense.nome_plano} />
              <HeaderPill label="Conta" value={liveAccount.numero_conta} />
            </div>
          </div>
        </section>

        <div className="grid min-w-0 gap-3 xl:grid-cols-12">
          <section className="glass-panel flex min-w-0 h-full flex-col overflow-hidden rounded-[24px] p-3.5 xl:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <PanelEyebrow>Grafico em Tempo Real</PanelEyebrow>
                <h2 className="mt-1 break-words text-[1.25rem] font-semibold leading-tight sm:text-[1.4rem]">Grafico tecnico {liveConfig.ativo}</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-200">{liveConfig.timeframe}</span>
                <span className="rounded-full bg-white/6 px-3 py-1 text-sm text-slate-200">{selectedLicense.nome_plano}</span>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${floatingProfit >= 0 ? "bg-lime-400/12 text-lime-300" : "bg-red-400/12 text-red-300"}`}>{floatingProfit >= 0 ? "No lucro" : "No prejuizo"}</span>
              </div>
            </div>
            <TradingViewChart initialSymbol={liveConfig.ativo} initialTimeframe={liveConfig.timeframe} />
          </section>

          <section className="glass-panel min-w-0 rounded-[24px] p-3.5 xl:col-span-4">
            <div className="grid gap-3">
              <div className="rounded-[18px] border border-white/8 bg-slate-950/35 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <PanelEyebrow>Controle Central</PanelEyebrow>
                    <h3 className="mt-1 text-lg font-semibold leading-tight">{isSystemOnline ? "Sistema armado" : "Sistema em pausa"}</h3>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${isSystemOnline ? "bg-lime-400/12 text-lime-300" : "bg-white/8 text-slate-300"}`}>{isSystemOnline ? "Operando" : "Pausado"}</span>
                </div>

                <form key={`toggle-${selectedAccountId}`} onSubmit={handleToggleSubmit} className="mt-3">
                  <input type="hidden" name="config_id" value={liveConfig.id ?? ""} />
                  <input type="hidden" name="conta_trading_id" value={selectedAccountId} />
                  <input type="hidden" name="current_state" value={String(liveConfig.sistema_ligado)} />
                  <input type="hidden" name="ativo" value={liveConfig.ativo} />
                  <input type="hidden" name="timeframe" value={liveConfig.timeframe} />
                  <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-3 rounded-[16px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(157,232,51,0.16)] transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">
                    <span>{liveConfig.sistema_ligado ? "||" : ">"}</span>
                    {liveConfig.sistema_ligado ? "Pausar automacao" : "Armar automacao"}
                  </button>
                </form>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ToggleCard label="Breakeven" value={liveConfig.breakeven_ativo ? "ON" : "OFF"} />
                  <ToggleCard label="Trailing" value={liveConfig.trailing_stop_ativo ? "ON" : "OFF"} />
                </div>
              </div>

              <div className="rounded-[18px] border border-white/8 bg-white/4 p-3.5">
                <PanelEyebrow>Conta de Trading</PanelEyebrow>
                <div className="mt-2 grid gap-2 rounded-[16px] border border-white/8 bg-slate-950/35 p-3">
                  <DataRow label="Cliente" value={liveAccount.nome_cliente} compact />
                  <DataRow label="Corretora" value={liveAccount.corretora ?? "Nao informada"} compact />
                  <DataRow label="Saldo" value={formatAccountCurrency(liveAccount.saldo_atual ?? 0, liveAccount)} compact />
                  <DataRow label="Equity" value={formatAccountCurrency(liveAccount.equity ?? 0, liveAccount)} compact />
                  <DataRow label="Margem livre" value={formatAccountCurrency(liveAccount.margem_livre ?? 0, liveAccount)} compact />
                  <DataRow label="Margem" value={`${liveAccount.nivel_margem ?? 0}%`} compact />
                </div>
              </div>

              <div>
                <PanelEyebrow>Leitura Tecnica</PanelEyebrow>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-2">
                  <CompactMetric label="Tendencia" value={String(marketSnapshot.trend ?? "range")} compact />
                  <CompactMetric label="RSI 14" value={marketSnapshot.rsi != null ? String(marketSnapshot.rsi) : "--"} tone="text-cyan-200" compact />
                  <CompactMetric label="MM20" value={marketSnapshot.moving_average_20 != null ? String(marketSnapshot.moving_average_20) : "--"} compact />
                  <CompactMetric label="Suporte / Resistencia" value={`${marketSnapshot.support ?? "--"} / ${marketSnapshot.resistance ?? "--"}`} compact />
                </div>
              </div>

              <div className="rounded-[18px] border border-lime-400/20 bg-lime-400/8 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.2em] text-lime-200/70">Resultado Flutuante</p>
                <p className={`mt-2 break-words text-[1.6rem] font-bold ${floatingProfit >= 0 ? "text-lime-300" : "text-red-300"}`}>{floatingProfit >= 0 ? "+" : "-"}{formatAccountCurrency(Math.abs(floatingProfit), liveAccount)}</p>
                <p className="mt-1 text-sm text-slate-300">Janela operacional {formatTimeRange(liveConfig.horario_inicio, liveConfig.horario_fim)}.</p>
              </div>

              {latestCommand?.erro ? <p className="rounded-[14px] border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">{latestCommand.erro}</p> : null}
            </div>
          </section>

          <section className="glass-panel min-w-0 rounded-[24px] p-3 xl:col-span-8">
            <div className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <PanelEyebrow>Operacao Atual</PanelEyebrow>
                  <h2 className="mt-1 break-words text-[1.15rem] font-semibold leading-tight sm:text-[1.28rem]">{liveOpenOperation ? `${liveOpenOperation.direction === "buy" ? "Compra" : "Venda"} ${liveOpenOperation.symbol}` : hasDetectedOpenPosition ? "Posicao detectada no MT5" : "Nenhuma operacao aberta"}</h2>
                </div>
                {fallbackOpenTicket ? <span className="rounded-full bg-white/6 px-3 py-1 text-sm text-slate-200">Ticket {fallbackOpenTicket}</span> : null}
              </div>

              {liveOpenOperation ? (
                <>
                  <div className="grid gap-2 xl:grid-cols-2">
                    <InlineMetric label="Direcao" value={liveOpenOperation.direction === "buy" ? "Compra" : "Venda"} tone={liveOpenOperation.direction === "buy" ? "text-lime-300" : "text-red-300"} />
                    <InlineMetric label="Entrada" value={liveOpenOperation.entryPrice.toFixed(2)} />
                    <InlineMetric label="Lote" value={liveOpenOperation.lot.toFixed(2)} />
                    <InlineMetric label="P/L atual" value={`${floatingProfit >= 0 ? "+" : "-"}${formatAccountCurrency(Math.abs(floatingProfit), liveAccount)}`} tone={floatingProfit >= 0 ? "text-lime-400" : "text-red-400"} />
                    <InlineMetric label="Stop Loss" value={liveOpenOperation.stopLoss != null ? liveOpenOperation.stopLoss.toFixed(2) : "--"} tone="text-red-300" />
                    <InlineMetric label="Take Profit" value={liveOpenOperation.takeProfit != null ? liveOpenOperation.takeProfit.toFixed(2) : "--"} tone="text-lime-300" />
                  </div>
                  <div className="rounded-[16px] border border-white/8 bg-white/4 px-3.5 py-3 text-sm text-slate-300">{liveInsightBundle.summary ?? liveInsightBundle.notes[0] ?? "Sem resumo operacional recente para esta conta."}</div>
                </>
              ) : hasDetectedOpenPosition ? (
                <div className="rounded-[18px] border border-cyan-400/20 bg-cyan-400/8 p-4 text-sm text-cyan-100">Existe uma posicao aberta detectada via sincronizacao do MT5. Os detalhes completos ainda estao sendo reconciliados, mas os comandos de parcial e fechamento ja podem ser usados.</div>
              ) : (
                <div className="rounded-[18px] border border-white/8 bg-white/4 p-4 text-sm text-slate-400">Assim que houver uma posicao aberta, este bloco consolida direcao, lote, entrada, P/L e niveis de saida sem deslocar a leitura do grafico.</div>
              )}
            </div>
          </section>

          <section className="glass-panel min-w-0 rounded-[24px] p-3.5 xl:col-span-4 xl:row-span-2">
            <PanelEyebrow>Execucao e Parametros</PanelEyebrow>
            <form key={`manual-${selectedAccountId}-${liveOpenOperation?.id ?? "idle"}`} onSubmit={handleManualSubmit} className="mt-3 grid gap-3 rounded-[18px] border border-white/8 bg-white/4 p-3.5">
              <input type="hidden" name="conta_trading_id" value={selectedAccountId} />
              <input type="hidden" name="ativo" value={liveConfig.ativo} />
              <input type="hidden" name="timeframe" value={liveConfig.timeframe} />
              <input type="hidden" name="ticket_referencia" value={fallbackOpenTicket ?? ""} />
              <SettingsField label="Lote" name="lote" type="text" inputMode="decimal" defaultValue={liveOpenOperation ? liveOpenOperation.lot.toFixed(2).replace(".", ",") : "0,10"} compact />
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsField label="Stop Loss" name="stop_loss" type="text" inputMode="decimal" defaultValue={liveOpenOperation?.stopLoss != null ? String(liveOpenOperation.stopLoss).replace(".", ",") : ""} compact />
                <SettingsField label="Take Profit" name="take_profit" type="text" inputMode="decimal" defaultValue={liveOpenOperation?.takeProfit != null ? String(liveOpenOperation.takeProfit).replace(".", ",") : ""} compact />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ActionButton label="Comprar" tone="buy" dataAction="buy" disabled={isSubmitting} />
                <ActionButton label="Vender" tone="sell" dataAction="sell" disabled={isSubmitting} />
                <ActionButton label="Parcial 50%" tone="neutral" dataAction="partial" disabled={!canManageOpenPosition} />
                <ActionButton label="Fechar posicao" tone="neutral" dataAction="close" disabled={!canManageOpenPosition} />
              </div>
            </form>

            <form key={`settings-${selectedAccountId}`} onSubmit={handleSettingsSubmit} className="mt-3 grid gap-3 rounded-[18px] border border-white/8 bg-white/4 p-3.5">
              <input type="hidden" name="config_id" value={liveConfig.id ?? ""} />
              <input type="hidden" name="conta_trading_id" value={selectedAccountId} />
              <input type="hidden" name="current_system_state" value={String(liveConfig.sistema_ligado)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <SettingsField label="Ativo" name="ativo" defaultValue={liveConfig.ativo} compact />
                <label className="grid gap-1.5">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Timeframe</span>
                  <select name="timeframe" defaultValue={liveConfig.timeframe} className="rounded-[14px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none">
                    {"M1,M5,M15,M30,H1".split(",").map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Modo</span>
                  <select name="modo" defaultValue={liveConfig.modo} className="rounded-[14px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none">
                    <option value="agressivo">Agressivo</option>
                    <option value="conservador">Conservador</option>
                  </select>
                </label>
                <SettingsField label="Inicio" name="horario_inicio" type="time" defaultValue={liveConfig.horario_inicio.slice(0, 5)} compact />
                <SettingsField label="Fim" name="horario_fim" type="time" defaultValue={liveConfig.horario_fim.slice(0, 5)} compact />
                <SettingsField label="Meta diaria" name="meta_lucro_diaria" type="text" inputMode="decimal" defaultValue={String(liveConfig.meta_lucro_diaria)} compact />
                <SettingsField label="Perda maxima" name="perda_maxima_diaria" type="text" inputMode="decimal" defaultValue={String(liveConfig.perda_maxima_diaria)} compact />
                <SettingsField label="Limite operacoes" name="limite_operacoes_diaria" type="text" inputMode="numeric" defaultValue={String(liveConfig.limite_operacoes_diaria ?? "")} compact />
                <SettingsField label="Risco por operacao (%)" name="risco_por_operacao" type="text" inputMode="decimal" defaultValue={String((liveConfig.risco_por_operacao ?? 0.01) * 100).replace(".", ",")} compact />
              </div>
              <div className="grid gap-2 rounded-[16px] border border-white/8 bg-slate-950/35 p-3">
                <CheckBox label="Breakeven ativo" name="breakeven_ativo" defaultChecked={liveConfig.breakeven_ativo} />
                <CheckBox label="Trailing stop ativo" name="trailing_stop_ativo" defaultChecked={liveConfig.trailing_stop_ativo} />
                <CheckBox label="Limite de operacoes ativo" name="limite_operacoes_ativo" defaultChecked={liveConfig.limite_operacoes_ativo} />
              </div>
              <button type="submit" disabled={isSubmitting} className="w-full rounded-[16px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60">Salvar parametros</button>
            </form>
          </section>

          <section className="glass-panel min-w-0 rounded-[24px] p-3.5 xl:col-span-5">
            <PanelEyebrow>Estatisticas da Conta</PanelEyebrow>
            <div className="mt-3 grid gap-2">
              {metrics.map((item) => <InlineMetric key={item.label} label={item.label} value={item.value} tone={item.tone} />)}
            </div>
            <div className="mt-3 grid gap-2 rounded-[18px] border border-white/8 bg-slate-950/35 p-3.5">
              <DataRow label="Operacoes" value={String(liveStats.operacoes_total)} compact />
              <DataRow label="Vitorias" value={String(liveStats.vitorias)} compact />
              <DataRow label="Derrotas" value={String(liveStats.derrotas)} compact />
              <DataRow label="Maior ganho" value={formatAccountCurrency(liveStats.melhor_operacao, liveAccount)} compact />
              <DataRow label="Maior perda" value={formatAccountCurrency(liveStats.pior_operacao, liveAccount)} compact />
            </div>
          </section>

          <section className="glass-panel min-w-0 rounded-[24px] p-3.5 xl:col-span-7">
            <PanelEyebrow>Monitor da Conta</PanelEyebrow>
            <div className="mt-3 grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="grid gap-2 rounded-[18px] border border-white/8 bg-slate-950/35 p-3.5">
                <DataRow label="Ativo" value={liveConfig.ativo} compact />
                <DataRow label="Timeframe" value={liveConfig.timeframe} compact />
                <DataRow label="Modo" value={liveConfig.modo === "agressivo" ? "Agressivo" : "Conservador"} compact />
                <DataRow label="Janela operacional" value={formatTimeRange(liveConfig.horario_inicio, liveConfig.horario_fim)} compact />
                <DataRow label="Meta diaria" value={formatAccountCurrency(liveConfig.meta_lucro_diaria, liveAccount)} compact />
                <DataRow label="Perda maxima" value={formatAccountCurrency(liveConfig.perda_maxima_diaria, liveAccount)} compact />
                <DataRow label="Limite operacoes" value={liveConfig.limite_operacoes_ativo ? String(liveConfig.limite_operacoes_diaria ?? 0) : "Desativado"} compact />
                <DataRow label="Risco por operacao" value={`${((liveConfig.risco_por_operacao ?? 0.01) * 100).toFixed(2)}%`} compact />
                <DataRow label="IA trader" value={automationStatus === "ready" ? "Pronta" : automationStatus === "blocked" ? "Bloqueada" : "Aguardando"} compact />
              </div>
              <div className="grid gap-2">
                {([automationReason, ...(liveInsightBundle.notes.length > 0 ? liveInsightBundle.notes : ["Sem observacoes adicionais no momento."])].filter((item, index, array) => item && array.indexOf(item) === index).slice(0, 6)).map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-[16px] border border-white/8 bg-white/4 px-3.5 py-3 text-sm text-slate-200"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-cyan-300" /><span>{item}</span></div>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-panel min-w-0 rounded-[24px] p-3.5 xl:col-span-12">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <PanelEyebrow>Timeline Operacional</PanelEyebrow>
                <p className="mt-1 text-sm text-slate-300">Historico consolidado das operacoes fechadas para leitura operacional sem perder o foco do topo do painel.</p>
              </div>
              <form onSubmit={handleFilterSubmit} className="grid w-full gap-2 rounded-[18px] border border-white/8 bg-white/4 p-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-[140px_140px_140px_140px_auto]">
                <SettingsField label="De" name="from" type="date" defaultValue={historyFilters.from} compact />
                <SettingsField label="Ate" name="to" type="date" defaultValue={historyFilters.to} compact />
                <label className="grid gap-1.5">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Tipo</span>
                  <select name="type" defaultValue={historyFilters.type} className="rounded-[14px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none">
                    <option value="all">Todos</option>
                    <option value="compra">Compra</option>
                    <option value="venda">Venda</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-400">Resultado</span>
                  <select name="result" defaultValue={historyFilters.result} className="rounded-[14px] border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none">
                    <option value="all">Todos</option>
                    <option value="gain">Ganho</option>
                    <option value="loss">Perda</option>
                  </select>
                </label>
                <button className="rounded-[14px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 xl:self-end">Filtrar</button>
              </form>
            </div>

            <div className="mt-3 overflow-hidden rounded-[18px] border border-white/8 bg-slate-950/30">
              <div className="grid grid-cols-[76px_88px_74px_1fr_112px] gap-3 border-b border-white/8 px-3 py-3 text-[11px] uppercase tracking-[0.22em] text-slate-400 sm:grid-cols-[88px_100px_88px_1fr_128px]">
                <span>Hora</span>
                <span>Tipo</span>
                <span>Lote</span>
                <span>Entrada</span>
                <span>Resultado</span>
              </div>
              <div className="h-[30rem] overflow-y-auto">
                {liveHistory.length > 0 ? liveHistory.map((row) => (
                  <div key={row.id} className="grid grid-cols-[76px_88px_74px_1fr_112px] gap-3 border-b border-white/6 px-3 py-3 text-sm last:border-b-0 even:bg-white/3 sm:grid-cols-[88px_100px_88px_1fr_128px]">
                    <span className="text-slate-300">{row.time}</span>
                    <span>{row.type}</span>
                    <span>{row.lot}</span>
                    <span className="text-slate-300">{row.entry}</span>
                    <span className={`font-semibold ${row.resultTone}`}>{liveAccount.moeda_simbolo} {row.result}</span>
                  </div>
                )) : <div className="px-4 py-10 text-center text-slate-400">Nenhuma operacao encontrada para os filtros selecionados.</div>}
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-50 grid max-w-[320px] gap-2">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </>
  );
}

function PanelEyebrow({ children }: { children: string }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-cyan-200/70">{children}</p>;
}

function HeaderPill({ label, value, online = false, accent = "text-white" }: { label: string; value: string; online?: boolean; accent?: string }) {
  return <div className="rounded-[18px] border border-white/8 bg-white/4 px-3.5 py-3"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p><div className={`mt-1.5 flex items-center gap-2 text-sm font-semibold ${accent}`}>{online ? <span className="h-2.5 w-2.5 rounded-full bg-lime-400 shadow-[0_0_18px_rgba(157,232,51,0.9)]" /> : null}<span className="break-words">{value}</span></div></div>;
}

function TopMetric({ label, value, tone = "text-slate-100" }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-[18px] border border-white/8 bg-white/4 px-3.5 py-3"><p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{label}</p><p className={`mt-1.5 break-words text-sm font-semibold ${tone}`}>{value}</p></div>;
}

function ToggleCard({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-slate-950/40 px-3 py-2.5"><span className="text-sm font-medium">{label}</span><span className="rounded-full bg-lime-400/12 px-2.5 py-0.5 text-xs font-semibold text-lime-300">{value}</span></div>;
}

function DataRow({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return <div className={`flex items-center justify-between gap-4 border-b border-white/6 ${compact ? "pb-2" : "pb-2.5"} last:border-b-0 last:pb-0`}><span className={`${compact ? "text-xs uppercase tracking-[0.16em] text-slate-500" : "text-sm text-slate-400"}`}>{label}</span><span className={`max-w-[64%] break-words text-right font-semibold ${compact ? "text-sm" : "text-sm sm:text-base"}`}>{value}</span></div>;
}

function CompactMetric({ label, value, tone = "text-white", compact = false }: { label: string; value: string; tone?: string; compact?: boolean }) {
  return <div className="rounded-[16px] border border-white/8 bg-white/4 px-3.5 py-3"><p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p><p className={`mt-1.5 break-words font-semibold ${compact ? "text-base" : "text-xl"} ${tone}`}>{value}</p></div>;
}

function InlineMetric({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-[14px] border border-white/8 bg-white/4 px-3.5 py-2.5"><span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</span><span className={`text-right text-sm font-semibold ${tone}`}>{value}</span></div>;
}

function SettingsField({ label, name, defaultValue, type = "text", inputMode, compact = false }: { label: string; name: string; defaultValue: string; type?: string; inputMode?: "none" | "text" | "tel" | "url" | "email" | "numeric" | "decimal" | "search"; compact?: boolean }) {
  return <label className="grid gap-1.5"><span className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</span><input name={name} type={type} inputMode={inputMode} defaultValue={defaultValue} className={`min-w-0 rounded-[14px] border border-white/10 bg-slate-950/50 text-sm text-white outline-none ${compact ? "px-3 py-2" : "px-4 py-2.5"}`} /></label>;
}

function CheckBox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return <label className="flex items-center gap-3 text-sm text-slate-200"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded border-white/20 bg-slate-950/60" />{label}</label>;
}

function ActionButton({ label, tone, dataAction, disabled }: { label: string; tone: "buy" | "sell" | "neutral"; dataAction: string; disabled: boolean }) {
  const className = tone === "buy"
    ? "bg-lime-500/85 text-white hover:bg-lime-500"
    : tone === "sell"
      ? "bg-red-500/85 text-white hover:bg-red-500"
      : "border border-white/10 bg-white/6 text-slate-100 hover:bg-white/10";

  return <button type="submit" data-trade-action={dataAction} disabled={disabled} className={`w-full rounded-[14px] px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>{label}</button>;
}

function ToastCard({ toast }: { toast: DashboardToast }) {
  const toneClass = toast.tone === "success"
    ? "border-lime-400/25 bg-lime-400/10 text-lime-100"
    : toast.tone === "error"
      ? "border-red-400/25 bg-red-400/10 text-red-100"
      : "border-cyan-400/25 bg-cyan-400/10 text-cyan-100";

  return (
    <div className={`pointer-events-auto rounded-[16px] border px-4 py-3 shadow-[0_12px_40px_rgba(2,6,23,0.45)] backdrop-blur-xl ${toneClass}`}>
      <p className="text-sm font-semibold">{toast.title}</p>
      {toast.detail ? <p className="mt-1 text-xs text-current/80">{toast.detail}</p> : null}
    </div>
  );
}



