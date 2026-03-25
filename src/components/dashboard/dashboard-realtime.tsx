"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import type { AppUser } from "@/lib/auth";
import { saveTradingSettings, submitTradeCommand, toggleSystemState } from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import { TradingViewChart } from "@/components/dashboard/tradingview-chart";
import type {
  DashboardAccount,
  DashboardConfig,
  DashboardHistoryFilters,
  DashboardHistoryRow,
  DashboardInsightBundle,
  DashboardLicense,
  DashboardOpenOperation,
  DashboardStats,
  DashboardCommandStatus,
} from "@/app/dashboard/page";

type SelectableAccount = DashboardAccount & {
  license: DashboardLicense;
};

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

function formatLicenseCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTimeRange(start: string, end: string) {
  return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T00:00:00`));
}

export function DashboardRealtime({
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
  const supabase = createClient();
  const [, startTransition] = useTransition();
  const [liveAccount, setLiveAccount] = useState(account);
  const [liveConfig, setLiveConfig] = useState(config);
  const [liveStats, setLiveStats] = useState(stats);
  const [liveHistory, setLiveHistory] = useState(history);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [liveInsightBundle, setLiveInsightBundle] = useState(insightBundle);
  const [liveOpenOperation, setLiveOpenOperation] = useState(openOperation);
  const [liveCommandStatuses, setLiveCommandStatuses] = useState(commandStatuses);

  const metrics = [
    { label: "Lucro do Dia", value: formatAccountCurrency(Math.max(liveStats.lucro_total, 0), liveAccount), tone: "text-lime-400" },
    { label: "Perda do Dia", value: `-${formatAccountCurrency(Math.abs(liveStats.prejuizo_total), liveAccount)}`, tone: "text-red-400" },
    { label: "Win Rate", value: `${liveStats.win_rate}%`, tone: "text-white" },
    { label: "Drawdown", value: `${liveStats.drawdown}%`, tone: "text-white" },
  ];

  const refreshSnapshot = useEffectEvent(async () => {
    const [{ data: nextAccount }, { data: nextConfig }, { data: nextStats }, { data: nextOperations }, { data: nextCommands }] = await Promise.all([
      supabase
        .from("contas_trading")
        .select("id, user_id, nome_cliente, numero_conta, corretora, moeda_codigo, moeda_simbolo, saldo_atual, equity, margem_livre, nivel_margem, ativo, atualizado_em, server_time, mercado_snapshot, insight_atual, ultima_sincronizacao")
        .eq("id", selectedAccountId)
        .maybeSingle<DashboardAccount>(),
      supabase
        .from("configuracoes_sessao")
        .select("id, conta_trading_id, ativo, timeframe, sistema_ligado, modo, breakeven_ativo, trailing_stop_ativo, horario_inicio, horario_fim, meta_lucro_diaria, perda_maxima_diaria, limite_operacoes_ativo, limite_operacoes_diaria")
        .eq("conta_trading_id", selectedAccountId)
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle<DashboardConfig>(),
      supabase
        .from("estatisticas")
        .select("conta_trading_id, operacoes_total, vitorias, derrotas, win_rate, lucro_total, prejuizo_total, drawdown, melhor_operacao, pior_operacao")
        .eq("conta_trading_id", selectedAccountId)
        .order("periodo", { ascending: false })
        .limit(1)
        .maybeSingle<DashboardStats>(),
      supabase
        .from("operacoes")
        .select("id, direcao, status, lote, preco_entrada, preco_saida, stop_loss, take_profit, lucro_prejuizo, aberta_em, fechada_em, timeframe, ativo, validacao_ia")
        .eq("conta_trading_id", selectedAccountId)
        .order("aberta_em", { ascending: false })
        .limit(50),
      supabase
        .from("comandos_trading")
        .select("id, tipo, status, erro, solicitado_em, processado_em")
        .eq("conta_trading_id", selectedAccountId)
        .order("solicitado_em", { ascending: false })
        .limit(5),
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
        setLiveConfig(nextConfig);
      }
      if (nextStats) {
        setLiveStats(nextStats);
      }
      if (nextOperations) {
        const nextOpenOperation = nextOperations.find((operation) => operation.status === "aberta");
        setLiveOpenOperation(nextOpenOperation ? {
          id: nextOpenOperation.id,
          direction: nextOpenOperation.direcao === "compra" ? "buy" : "sell",
          lot: Number(nextOpenOperation.lote),
          entryPrice: Number(nextOpenOperation.preco_entrada),
          stopLoss: nextOpenOperation.stop_loss != null ? Number(nextOpenOperation.stop_loss) : null,
          takeProfit: nextOpenOperation.take_profit != null ? Number(nextOpenOperation.take_profit) : null,
          openedAt: nextOpenOperation.aberta_em,
          timeframe: nextOpenOperation.timeframe,
          symbol: nextOpenOperation.ativo,
          profitLoss: Number(nextOpenOperation.lucro_prejuizo ?? 0),
        } : null);
        const nextRows: Array<DashboardHistoryRow | null> = nextOperations.map((operation) => {
          const resultValue = Number(operation.lucro_prejuizo ?? 0);
          if (operation.status === "aberta") {
            return null;
          }

          return {
            id: operation.id,
            time: new Intl.DateTimeFormat("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }).format(new Date(operation.fechada_em ?? operation.aberta_em)),
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
      if (nextCommands) {
        setLiveCommandStatuses(nextCommands as DashboardCommandStatus[]);
      }
    });
  });

  useEffect(() => {
    const interval = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`lumitrader-account-${selectedAccountId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contas_trading", filter: `id=eq.${selectedAccountId}` }, () => {
        void refreshSnapshot();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "configuracoes_sessao", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => {
        void refreshSnapshot();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "estatisticas", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => {
        void refreshSnapshot();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "operacoes", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => {
        void refreshSnapshot();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "licencas", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => {
        void refreshSnapshot();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comandos_trading", filter: `conta_trading_id=eq.${selectedAccountId}` }, () => {
        void refreshSnapshot();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedAccountId, supabase]);

  const floatingProfit = (liveAccount.equity ?? 0) - (liveAccount.saldo_atual ?? 0);
  const isSystemOnline = liveConfig.sistema_ligado && Boolean(liveAccount.ativo);
  const brasiliaClockLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(liveNow);
  const serverClock = new Date(liveNow.getTime() + 6 * 60 * 60 * 1000);
  const serverClockLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(serverClock);
  const latestCommand = liveCommandStatuses[0] ?? null;
  const commandTypeLabel = latestCommand
    ? latestCommand.tipo === "open_buy"
      ? "Compra"
      : latestCommand.tipo === "open_sell"
        ? "Venda"
        : "Fechamento"
    : null;
  const commandStatusLabel = latestCommand
    ? latestCommand.status === "pending"
      ? "Na fila"
      : latestCommand.status === "processing"
        ? "Executando na VPS"
        : latestCommand.status === "executed"
          ? "Executado"
          : latestCommand.status === "failed"
            ? "Falhou"
            : "Cancelado"
    : "Sem comandos recentes";
  const commandStatusTone = latestCommand
    ? latestCommand.status === "executed"
      ? "text-lime-300"
      : latestCommand.status === "failed"
        ? "text-red-300"
        : "text-amber-200"
    : "text-slate-300";

  return (
    <div className="mt-5 grid gap-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <HeaderPill label="Ativo" value={liveConfig.ativo} />
        <HeaderPill label="Modo" value={liveConfig.modo === "agressivo" ? "Agressivo" : "Conservador"} />
        <HeaderPill label="Conta" value={liveAccount.numero_conta} />
        <HeaderPill label="Licenca" value={selectedLicense.nome_plano} />
        <HeaderPill label="Status" value={isSystemOnline ? "ONLINE" : "PAUSADO"} online={isSystemOnline} />
      </div>

      <div className="rounded-[28px] border border-white/8 bg-white/4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.26em] text-cyan-200/70">Seletor de licenca</p>
            <p className="mt-2 text-sm text-slate-300">Cada conta MT5 opera de forma independente com limites, saldo, equity e metricas proprios.</p>
          </div>
          <form action="/dashboard" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select name="account" defaultValue={selectedAccountId} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="rounded-[18px] border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none">
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.numero_conta} · {item.nome_cliente} · expira {formatDate(item.license.data_expiracao)}
                </option>
              ))}
            </select>
          </form>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard eyebrow="Cliente" title={liveAccount.nome_cliente ?? profile.nome ?? "Trader"} detail={`Email: ${profile.email ?? "nao informado"}`} />
            <InfoCard eyebrow="Licenca" title={`${selectedLicense.status.toUpperCase()} ate ${formatDate(selectedLicense.data_expiracao)}`} detail={`Valor ${formatLicenseCurrency(selectedLicense.valor)}`} />
            <InfoCard eyebrow="Janela Operacional" title={formatTimeRange(liveConfig.horario_inicio, liveConfig.horario_fim)} detail={`${liveConfig.breakeven_ativo ? "Breakeven ON" : "Breakeven OFF"} / ${liveConfig.trailing_stop_ativo ? "Trailing ON" : "Trailing OFF"}`} />
          </div>

          <div className="grid gap-4 md:grid-cols-[1.08fr_0.92fr]">
            <div className="glass-panel rounded-[28px] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Controle Central</p>
                  <h2 className="mt-1 text-2xl font-semibold">{isSystemOnline ? "Auto trader armado" : "Sistema aguardando backend operacional"}</h2>
                </div>
                <div className="rounded-[18px] border border-lime-400/30 bg-lime-400/10 px-3 py-2 text-xs text-lime-300">
                  <div>Servidor: {serverClockLabel}</div>
                  <div>Brasilia: {brasiliaClockLabel}</div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ToggleCard label="Breakeven" value={liveConfig.breakeven_ativo ? "ON" : "OFF"} />
                <ToggleCard label="Trailing Stop" value={liveConfig.trailing_stop_ativo ? "ON" : "OFF"} />
              </div>

              <form className="mt-5">
                <input type="hidden" name="config_id" value={liveConfig.id ?? ""} />
                <input type="hidden" name="conta_trading_id" value={selectedAccountId} />
                <input type="hidden" name="current_state" value={String(liveConfig.sistema_ligado)} />
                <input type="hidden" name="ativo" value={liveConfig.ativo} />
                <input type="hidden" name="timeframe" value={liveConfig.timeframe} />
                <button formAction={toggleSystemState} className="flex w-full items-center justify-center gap-3 rounded-[24px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-6 py-5 text-2xl font-semibold text-slate-950 shadow-[0_20px_50px_rgba(157,232,51,0.28)] transition-transform duration-200 hover:-translate-y-0.5">
                  <span className="text-3xl">{liveConfig.sistema_ligado ? "■" : "▶"}</span>
                  {liveConfig.sistema_ligado ? "Pausar" : "Play"}
                </button>
              </form>

              <div className="mt-5 grid gap-3 rounded-[24px] border border-white/8 bg-white/4 p-4 md:grid-cols-3">
                <QuickFact label="Timeframe" value={liveConfig.timeframe} />
                <QuickFact label="Meta diaria" value={formatAccountCurrency(liveConfig.meta_lucro_diaria, liveAccount)} />
                <QuickFact label="Perda maxima" value={formatAccountCurrency(liveConfig.perda_maxima_diaria, liveAccount)} />
              </div>

              <div className="mt-4 rounded-[24px] border border-white/8 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-300">Limite de operacoes por dia</p>
                <p className="mt-2 text-xl font-semibold">{liveConfig.limite_operacoes_ativo ? String(liveConfig.limite_operacoes_diaria ?? 0) : "Desativado"}</p>
              </div>

              <div className="mt-4 rounded-[24px] border border-white/8 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-300">Canal operacional MT5</p>
                <p className={`mt-2 text-lg font-semibold ${commandStatusTone}`}>{commandStatusLabel}</p>
                <p className="mt-1 text-sm text-slate-400">
                  {liveAccount.ultima_sincronizacao
                    ? `Ultima leitura: ${new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      }).format(new Date(liveAccount.ultima_sincronizacao))}`
                    : "Aguardando primeira sincronizacao da VPS."}
                </p>
                {latestCommand ? (
                  <p className="mt-2 text-sm text-slate-300">
                    Ultimo comando: {commandTypeLabel} em {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      hour12: false,
                    }).format(new Date(latestCommand.solicitado_em))}
                  </p>
                ) : null}
                {latestCommand?.erro ? <p className="mt-2 text-sm text-red-300">{latestCommand.erro}</p> : null}
              </div>
            </div>

            <div className="glass-panel rounded-[28px] p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Conta de Trading</p>
                  <h2 className="mt-1 text-2xl font-semibold">{liveAccount.corretora ?? "Corretora nao informada"}</h2>
                </div>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-sm text-cyan-100">{liveAccount.numero_conta}</span>
              </div>

              <div className="mt-5 space-y-3 rounded-[24px] border border-white/8 bg-slate-950/40 p-4">
                <DataRow label="Nome do cliente" value={liveAccount.nome_cliente} />
                <DataRow label="Moeda" value={`${liveAccount.moeda_simbolo} / ${liveAccount.moeda_codigo}`} />
                <DataRow label="Saldo atual" value={formatAccountCurrency(liveAccount.saldo_atual ?? 0, liveAccount)} />
                <DataRow label="Equity" value={formatAccountCurrency(liveAccount.equity ?? 0, liveAccount)} />
                <DataRow label="Margem livre" value={formatAccountCurrency(liveAccount.margem_livre ?? 0, liveAccount)} />
              </div>

              <div className="mt-5 rounded-[24px] border border-lime-400/20 bg-lime-400/8 p-4">
                <p className="text-sm text-lime-200/80">Resultado flutuante</p>
                <p className="mt-2 text-4xl font-bold text-lime-300">{floatingProfit >= 0 ? "+" : "-"}{formatAccountCurrency(Math.abs(floatingProfit), liveAccount)}</p>
                <p className="mt-2 text-sm text-slate-300">Nivel de margem: {liveAccount.nivel_margem ?? 0}%.</p>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-[28px] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-200/70">Parametros desta conta</p>
            <form className="mt-4 grid gap-4 md:grid-cols-2">
              <input type="hidden" name="config_id" value={liveConfig.id ?? ""} />
              <input type="hidden" name="conta_trading_id" value={selectedAccountId} />
              <input type="hidden" name="current_system_state" value={String(liveConfig.sistema_ligado)} />
              <SettingsField label="Ativo" name="ativo" defaultValue={liveConfig.ativo} />
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Timeframe</span>
                <select name="timeframe" defaultValue={liveConfig.timeframe} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none">
                  {['M1', 'M5', 'M15', 'M30', 'H1'].map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm text-slate-300">Modo</span>
                <select name="modo" defaultValue={liveConfig.modo} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none">
                  <option value="agressivo">Agressivo</option>
                  <option value="conservador">Conservador</option>
                </select>
              </label>
              <SettingsField label="Horario inicio" name="horario_inicio" type="time" defaultValue={liveConfig.horario_inicio.slice(0, 5)} />
              <SettingsField label="Horario fim" name="horario_fim" type="time" defaultValue={liveConfig.horario_fim.slice(0, 5)} />
              <SettingsField label="Meta diaria" name="meta_lucro_diaria" type="number" defaultValue={String(liveConfig.meta_lucro_diaria)} />
              <SettingsField label="Perda maxima diaria" name="perda_maxima_diaria" type="number" defaultValue={String(liveConfig.perda_maxima_diaria)} />
              <SettingsField label="Limite de operacoes" name="limite_operacoes_diaria" type="number" defaultValue={String(liveConfig.limite_operacoes_diaria ?? "")} />
              <div className="grid gap-3 rounded-[18px] border border-white/8 bg-slate-950/35 p-4">
                <CheckBox label="Breakeven ativo" name="breakeven_ativo" defaultChecked={liveConfig.breakeven_ativo} />
                <CheckBox label="Trailing stop ativo" name="trailing_stop_ativo" defaultChecked={liveConfig.trailing_stop_ativo} />
                <CheckBox label="Limite de operacoes ativo" name="limite_operacoes_ativo" defaultChecked={liveConfig.limite_operacoes_ativo} />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button formAction={saveTradingSettings} className="rounded-[18px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950">
                  Salvar parametros
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-panel rounded-[28px] p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Grafico em Tempo Real</p>
                <h2 className="mt-1 text-2xl font-semibold">Painel tecnico {liveConfig.ativo}</h2>
              </div>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-200">{liveConfig.timeframe}</span>
            </div>

            <TradingViewChart initialSymbol="XAUUSD" initialTimeframe="M5" />
          </div>


          <div className="glass-panel rounded-[28px] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Operacao Atual</p>
                <h2 className="mt-1 text-2xl font-semibold">{liveOpenOperation ? `${liveOpenOperation.direction === "buy" ? "Compra" : "Venda"} ${liveOpenOperation.symbol}` : "Nenhuma operacao aberta"}</h2>
              </div>
              {liveOpenOperation ? <span className={`rounded-full px-3 py-1 text-sm font-semibold ${floatingProfit >= 0 ? "bg-lime-400/12 text-lime-300" : "bg-red-400/12 text-red-300"}`}>{floatingProfit >= 0 ? "No lucro" : "No prejuizo"}</span> : null}
            </div>

            {liveOpenOperation ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatRow label="Direcao" value={liveOpenOperation.direction === "buy" ? "Compra" : "Venda"} />
                <StatRow label="Lote" value={liveOpenOperation.lot.toFixed(2)} />
                <StatRow label="Entrada" value={formatAccountCurrency(liveOpenOperation.entryPrice, liveAccount)} />
                <StatRow label="Timeframe" value={liveOpenOperation.timeframe} />
                <StatRow label="P/L em tempo real" value={`${floatingProfit >= 0 ? "+" : "-"}${formatAccountCurrency(Math.abs(floatingProfit), liveAccount)}`} valueTone={floatingProfit >= 0 ? "text-lime-400" : "text-red-400"} />
                <StatRow label="PnL" value={`${liveAccount.saldo_atual ? ((floatingProfit / Math.max(liveAccount.saldo_atual, 1)) * 100).toFixed(2) : "0.00"}%`} valueTone={floatingProfit >= 0 ? "text-lime-400" : "text-red-400"} />
                <StatRow label="Stop Loss" value={liveOpenOperation.stopLoss != null ? formatAccountCurrency(liveOpenOperation.stopLoss, liveAccount) : "--"} />
                <StatRow label="Take Profit" value={liveOpenOperation.takeProfit != null ? formatAccountCurrency(liveOpenOperation.takeProfit, liveAccount) : "--"} />
              </div>
            ) : (
              <div className="mt-5 rounded-[24px] border border-white/8 bg-white/4 p-4 text-slate-400">Assim que houver uma posicao aberta nesta conta, o painel mostra direcao, lote, entrada, P/L e PnL em tempo real.</div>
            )}
          </div>


          <div className="glass-panel rounded-[28px] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Execucao Manual</p>
            <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto_auto]">
              <input type="hidden" name="conta_trading_id" value={selectedAccountId} />
              <input type="hidden" name="ativo" value={liveConfig.ativo} />
              <input type="hidden" name="timeframe" value={liveConfig.timeframe} />
              <input type="hidden" name="ticket_referencia" value={liveOpenOperation?.id ?? ""} />
              <SettingsField label="Lote" name="lote" type="number" defaultValue={liveOpenOperation ? liveOpenOperation.lot.toFixed(2) : "0.10"} />
              <SettingsField label="Stop Loss" name="stop_loss" type="number" defaultValue={liveOpenOperation?.stopLoss != null ? String(liveOpenOperation.stopLoss) : ""} />
              <SettingsField label="Take Profit" name="take_profit" type="number" defaultValue={liveOpenOperation?.takeProfit != null ? String(liveOpenOperation.takeProfit) : ""} />
              <div className="flex items-end"><button formAction={submitTradeCommand} name="trade_action" value="buy" className="w-full rounded-[18px] bg-lime-400/12 px-4 py-3 text-sm font-semibold text-lime-200">Comprar</button></div>
              <div className="flex items-end"><button formAction={submitTradeCommand} name="trade_action" value="sell" className="w-full rounded-[18px] bg-red-400/12 px-4 py-3 text-sm font-semibold text-red-200">Vender</button></div>
              <div className="flex items-end"><button formAction={submitTradeCommand} name="trade_action" value="close" className="w-full rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100">Fechar posicao</button></div>
            </form>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            {metrics.map((item) => (
              <div key={item.label} className="glass-panel rounded-[24px] px-5 py-4">
                <p className="text-sm text-slate-300">{item.label}</p>
                <p className={`mt-4 text-3xl font-bold ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>

          <div className="glass-panel rounded-[32px] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Insights Operacionais</p>
            <div className="mt-5 grid gap-3">
              {liveInsightBundle.summary ? (
                <div className="rounded-[24px] border border-cyan-400/20 bg-cyan-400/10 p-4 text-slate-100">{liveInsightBundle.summary}</div>
              ) : (
                <div className="rounded-[24px] border border-white/8 bg-white/4 p-4 text-slate-400">Aguardando primeiro ciclo real do backend operacional para esta conta.</div>
              )}
              {liveInsightBundle.notes.map((insight) => (
                <div key={insight} className="rounded-[24px] border border-white/8 bg-white/4 p-4 text-slate-100"><span className="mr-3 text-lime-300">✓</span>{insight}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="glass-panel rounded-[32px] p-5">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Estatisticas da conta selecionada</p>
          <div className="mt-5 space-y-4">
            <StatRow label="Operacoes no periodo" value={String(liveStats.operacoes_total)} />
            <StatRow label="Vitorias" value={String(liveStats.vitorias)} />
            <StatRow label="Derrotas" value={String(liveStats.derrotas)} valueTone="text-red-400" />
            <StatRow label="Maior ganho" value={formatAccountCurrency(liveStats.melhor_operacao, liveAccount)} />
            <StatRow label="Maior perda" value={formatAccountCurrency(liveStats.pior_operacao, liveAccount)} valueTone="text-red-400" />
            <StatRow label="Drawdown atual" value={`${liveStats.drawdown}%`} />
          </div>
        </div>

        <div className="glass-panel rounded-[32px] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Historico de Operacoes</p>
              <h2 className="mt-1 text-2xl font-semibold">Timeline operacional da conta selecionada</h2>
            </div>
            <p className="text-sm text-slate-400">Licenca e dados desta conta sao atualizados em tempo real.</p>
          </div>

          <form action="/dashboard" className="mt-5 grid gap-3 rounded-[24px] border border-white/8 bg-white/4 p-4 md:grid-cols-[1fr_1fr_0.8fr_0.8fr_auto]">
            <input type="hidden" name="account" value={selectedAccountId} />
            <SettingsField label="De" name="from" type="date" defaultValue={historyFilters.from} />
            <SettingsField label="Ate" name="to" type="date" defaultValue={historyFilters.to} />
            <label className="grid gap-2"><span className="text-sm text-slate-300">Tipo</span><select name="type" defaultValue={historyFilters.type} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none"><option value="all">Todos</option><option value="compra">Compra</option><option value="venda">Venda</option></select></label>
            <label className="grid gap-2"><span className="text-sm text-slate-300">Resultado</span><select name="result" defaultValue={historyFilters.result} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none"><option value="all">Todos</option><option value="gain">Ganho</option><option value="loss">Perda</option></select></label>
            <div className="flex items-end"><button className="w-full rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">Filtrar</button></div>
          </form>

          <div className="mt-5 overflow-hidden rounded-[28px] border border-white/8">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden">
              <thead className="bg-white/6 text-left text-sm uppercase tracking-[0.22em] text-slate-400">
                <tr>
                  <th className="px-4 py-4">Hora</th>
                  <th className="px-4 py-4">Tipo</th>
                  <th className="px-4 py-4">Lote</th>
                  <th className="px-4 py-4">Entrada</th>
                  <th className="px-4 py-4">Resultado</th>
                </tr>
              </thead>
              <tbody className="bg-slate-950/30">
                {liveHistory.length > 0 ? (
                  liveHistory.map((row) => (
                    <tr key={row.id} className="text-base even:bg-white/3">
                      <td className="px-4 py-4 text-slate-300">{row.time}</td>
                      <td className="px-4 py-4">{row.type}</td>
                      <td className="px-4 py-4">{row.lot}</td>
                      <td className="px-4 py-4 text-slate-300">{row.entry}</td>
                      <td className={`px-4 py-4 font-semibold ${row.resultTone}`}>{liveAccount.moeda_simbolo} {row.result}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhuma operacao encontrada para os filtros selecionados.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function HeaderPill({ label, value, online = false }: { label: string; value: string; online?: boolean }) {
  return <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-3"><p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p><div className="mt-2 flex items-center gap-2 text-lg font-semibold">{online ? <span className="h-2.5 w-2.5 rounded-full bg-lime-400 shadow-[0_0_18px_rgba(157,232,51,0.9)]" /> : null}<span>{value}</span></div></div>;
}

function InfoCard({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return <div className="rounded-[24px] border border-white/8 bg-white/4 p-4"><p className="font-mono text-xs uppercase tracking-[0.26em] text-cyan-200/70">{eyebrow}</p><p className="mt-3 text-xl font-semibold">{title}</p><p className="mt-2 text-sm text-slate-400">{detail}</p></div>;
}

function ToggleCard({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between rounded-[24px] border border-white/8 bg-slate-950/40 px-4 py-3"><span className="text-lg">{label}</span><span className="rounded-full bg-lime-400/12 px-3 py-1 text-sm font-semibold text-lime-300">{value}</span></div>;
}

function QuickFact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold">{value}</p></div>;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between border-b border-white/6 pb-3 last:border-b-0 last:pb-0"><span className="text-slate-400">{label}</span><span className="font-semibold text-right">{value}</span></div>;
}

function StatRow({ label, value, valueTone = "text-white" }: { label: string; value: string; valueTone?: string }) {
  return <div className="flex items-center justify-between rounded-[24px] border border-white/8 bg-white/4 px-4 py-4"><span className="text-slate-300">{label}</span><span className={`text-xl font-semibold ${valueTone}`}>{value}</span></div>;
}

function SettingsField({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: string }) {
  return <label className="grid gap-2"><span className="text-sm text-slate-300">{label}</span><input name={name} type={type} defaultValue={defaultValue} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none" /></label>;
}

function CheckBox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked: boolean }) {
  return <label className="flex items-center gap-3 text-sm text-slate-200"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 rounded border-white/20 bg-slate-950/60" />{label}</label>;
}

