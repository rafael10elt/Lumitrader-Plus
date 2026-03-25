"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import type { AppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";
import type {
  DashboardAccount,
  DashboardConfig,
  DashboardHistoryRow,
  DashboardLicense,
  DashboardStats,
} from "@/app/dashboard/page";

type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
};

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
  insights: string[];
  candles: Candle[];
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

function formatTimeRange(start: string, end: string) {
  return `${start.slice(0, 5)}-${end.slice(0, 5)}`;
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
  insights,
  candles,
}: DashboardRealtimeProps) {
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();
  const [liveAccount, setLiveAccount] = useState(account);
  const [liveConfig, setLiveConfig] = useState(config);
  const [liveStats, setLiveStats] = useState(stats);
  const [liveHistory, setLiveHistory] = useState(history);

  const metrics = [
    { label: "Lucro do Dia", value: formatAccountCurrency(Math.max(liveStats.lucro_total, 0), liveAccount), tone: "text-lime-400" },
    { label: "Perda do Dia", value: `-${formatAccountCurrency(Math.abs(liveStats.prejuizo_total), liveAccount)}`, tone: "text-red-400" },
    { label: "Win Rate", value: `${liveStats.win_rate}%`, tone: "text-white" },
    { label: "Drawdown", value: `${liveStats.drawdown}%`, tone: "text-white" },
  ];

  const refreshSnapshot = useEffectEvent(async () => {
    const [{ data: nextAccount }, { data: nextConfig }, { data: nextStats }, { data: nextOperations }] = await Promise.all([
      supabase
        .from("contas_trading")
        .select("id, user_id, nome_cliente, numero_conta, corretora, moeda_codigo, moeda_simbolo, saldo_atual, equity, margem_livre, nivel_margem, ativo, atualizado_em")
        .eq("id", selectedAccountId)
        .maybeSingle<DashboardAccount>(),
      supabase
        .from("configuracoes_sessao")
        .select("conta_trading_id, ativo, sistema_ligado, modo, breakeven_ativo, trailing_stop_ativo, horario_inicio, horario_fim, meta_lucro_diaria, perda_maxima_diaria, limite_operacoes_ativo, limite_operacoes_diaria")
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
        .select("id, direcao, lote, preco_entrada, lucro_prejuizo, aberta_em")
        .eq("conta_trading_id", selectedAccountId)
        .order("aberta_em", { ascending: false })
        .limit(5),
    ]);

    startTransition(() => {
      if (nextAccount) {
        setLiveAccount(nextAccount);
      }
      if (nextConfig) {
        setLiveConfig(nextConfig);
      }
      if (nextStats) {
        setLiveStats(nextStats);
      }
      if (nextOperations) {
        setLiveHistory(
          nextOperations.map((operation) => {
            const resultValue = Number(operation.lucro_prejuizo ?? 0);
            return {
              id: operation.id,
              time: new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(operation.aberta_em)),
              type: operation.direcao === "compra" ? "Compra" : "Venda",
              lot: Number(operation.lote).toFixed(2),
              entry: Number(operation.preco_entrada).toFixed(2),
              result: `${resultValue >= 0 ? "+" : "-"}${Math.abs(resultValue).toFixed(2)}`,
              resultTone: resultValue >= 0 ? "text-lime-400" : "text-red-400",
            };
          }),
        );
      }
    });
  });

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedAccountId, supabase]);

  const floatingProfit = (liveAccount.equity ?? 0) - (liveAccount.saldo_atual ?? 0);
  const isSystemOnline = liveConfig.sistema_ligado && Boolean(liveAccount.ativo);
  const accountUpdatedLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(liveAccount.atualizado_em));

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
            <select name="account" defaultValue={selectedAccountId} className="rounded-[18px] border border-white/10 bg-slate-950/60 px-4 py-3 text-white outline-none">
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.numero_conta} · {item.nome_cliente} · expira {item.license.data_expiracao}
                </option>
              ))}
            </select>
            <button className="rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">
              Trocar conta
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard eyebrow="Cliente" title={liveAccount.nome_cliente ?? profile.nome ?? "Trader"} detail={`Email: ${profile.email ?? "nao informado"}`} />
            <InfoCard eyebrow="Licenca" title={`${selectedLicense.status.toUpperCase()} ate ${selectedLicense.data_expiracao}`} detail={`Valor ${formatAccountCurrency(selectedLicense.valor, liveAccount)}`} />
            <InfoCard eyebrow="Janela Operacional" title={formatTimeRange(liveConfig.horario_inicio, liveConfig.horario_fim)} detail={`${liveConfig.breakeven_ativo ? "Breakeven ON" : "Breakeven OFF"} / ${liveConfig.trailing_stop_ativo ? "Trailing ON" : "Trailing OFF"}`} />
          </div>

          <div className="grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <div className="glass-panel rounded-[28px] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Controle Central</p>
                  <h2 className="mt-1 text-2xl font-semibold">{isSystemOnline ? "Auto trader armado" : "Sistema aguardando backend operacional"}</h2>
                </div>
                <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-sm font-medium text-lime-300">
                  {isPending ? "Sincronizando" : accountUpdatedLabel}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <ToggleCard label="Breakeven" value={liveConfig.breakeven_ativo ? "ON" : "OFF"} />
                <ToggleCard label="Trailing Stop" value={liveConfig.trailing_stop_ativo ? "ON" : "OFF"} />
              </div>

              <button className="mt-5 flex w-full items-center justify-center gap-3 rounded-[24px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-6 py-5 text-2xl font-semibold text-slate-950 shadow-[0_20px_50px_rgba(157,232,51,0.28)] transition-transform duration-200 hover:-translate-y-0.5">
                <span className="text-3xl">▶</span>
                Play
              </button>

              <div className="mt-5 grid gap-3 rounded-[24px] border border-white/8 bg-white/4 p-4 md:grid-cols-3">
                <QuickFact label="Timeframe" value={profile.timeframe_padrao} />
                <QuickFact label="Meta diaria" value={formatAccountCurrency(liveConfig.meta_lucro_diaria, liveAccount)} />
                <QuickFact label="Perda maxima" value={formatAccountCurrency(liveConfig.perda_maxima_diaria, liveAccount)} />
              </div>

              <div className="mt-4 rounded-[24px] border border-white/8 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-300">Limite de operacoes por dia</p>
                <p className="mt-2 text-xl font-semibold">
                  {liveConfig.limite_operacoes_ativo ? String(liveConfig.limite_operacoes_diaria ?? 0) : "Desativado"}
                </p>
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
                <p className="mt-2 text-4xl font-bold text-lime-300">
                  {floatingProfit >= 0 ? "+" : "-"}
                  {formatAccountCurrency(Math.abs(floatingProfit), liveAccount)}
                </p>
                <p className="mt-2 text-sm text-slate-300">Nivel de margem: {liveAccount.nivel_margem ?? 0}%.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((item) => (
              <div key={item.label} className="glass-panel rounded-[24px] px-5 py-4">
                <p className="text-sm text-slate-300">{item.label}</p>
                <p className={`mt-4 text-3xl font-bold ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel rounded-[28px] p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Grafico em Tempo Real</p>
              <h2 className="mt-1 text-2xl font-semibold">Painel tecnico {liveConfig.ativo}</h2>
            </div>
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-cyan-200">{profile.timeframe_padrao}</span>
          </div>

          <CandlestickChart candles={candles} currencySymbol={liveAccount.moeda_simbolo} />
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
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Insights Operacionais</p>
          <div className="mt-5 grid gap-3">
            {insights.map((insight) => (
              <div key={insight} className="rounded-[24px] border border-white/8 bg-white/4 p-4 text-slate-100">
                <span className="mr-3 text-lime-300">✓</span>
                {insight}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-[32px] p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Historico de Operacoes</p>
            <h2 className="mt-1 text-2xl font-semibold">Timeline operacional da conta selecionada</h2>
          </div>
          <p className="text-sm text-slate-400">Licenca e dados desta conta sao atualizados em tempo real.</p>
        </div>

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
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Nenhuma operacao registrada para esta conta ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function HeaderPill({ label, value, online = false }: { label: string; value: string; online?: boolean }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
        {online ? <span className="h-2.5 w-2.5 rounded-full bg-lime-400 shadow-[0_0_18px_rgba(157,232,51,0.9)]" /> : null}
        <span>{value}</span>
      </div>
    </div>
  );
}

function InfoCard({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
      <p className="font-mono text-xs uppercase tracking-[0.26em] text-cyan-200/70">{eyebrow}</p>
      <p className="mt-3 text-xl font-semibold">{title}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function ToggleCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[24px] border border-white/8 bg-slate-950/40 px-4 py-3">
      <span className="text-lg">{label}</span>
      <span className="rounded-full bg-lime-400/12 px-3 py-1 text-sm font-semibold text-lime-300">{value}</span>
    </div>
  );
}

function QuickFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/6 pb-3 last:border-b-0 last:pb-0">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function StatRow({ label, value, valueTone = "text-white" }: { label: string; value: string; valueTone?: string }) {
  return (
    <div className="flex items-center justify-between rounded-[24px] border border-white/8 bg-white/4 px-4 py-4">
      <span className="text-slate-300">{label}</span>
      <span className={`text-xl font-semibold ${valueTone}`}>{value}</span>
    </div>
  );
}

function CandlestickChart({ candles, currencySymbol }: { candles: Candle[]; currencySymbol: string }) {
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = Math.max(max - min, 1);
  const last = candles[candles.length - 1];

  return (
    <div className="grid-sheen relative mt-5 h-[420px] overflow-hidden rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.12),transparent_28%),linear-gradient(180deg,rgba(5,11,21,0.95),rgba(3,8,16,0.98))] p-4">
      <div className="absolute inset-x-4 top-6 flex justify-between text-xs text-slate-500">
        <span>{currencySymbol} {max.toFixed(2)}</span>
        <span>{currencySymbol} {((max + min) / 2).toFixed(2)}</span>
        <span>{currencySymbol} {min.toFixed(2)}</span>
      </div>
      <div className="absolute inset-x-4 bottom-5 top-12 flex items-end gap-2">
        {candles.map((candle, index) => {
          const wickTop = ((max - candle.high) / range) * 100;
          const wickHeight = ((candle.high - candle.low) / range) * 100;
          const bodyTop = ((max - Math.max(candle.open, candle.close)) / range) * 100;
          const bodyHeight = Math.max((Math.abs(candle.open - candle.close) / range) * 100, 1.8);
          const isBull = candle.close >= candle.open;

          return (
            <div key={`${candle.open}-${candle.close}-${index}`} className="relative flex h-full flex-1 items-center justify-center">
              <div className="absolute w-[2px] rounded-full bg-slate-300/60" style={{ top: `${wickTop}%`, height: `${wickHeight}%` }} />
              <div className={`absolute w-4 rounded-[4px] ${isBull ? "border border-lime-300/90 bg-lime-400/85" : "border border-red-300/90 bg-red-400/85"}`} style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />
            </div>
          );
        })}
      </div>
      <div className="absolute inset-x-6 top-24 h-px border-t border-dashed border-lime-400/40" />
      <div className="absolute right-4 top-4 rounded-2xl border border-white/8 bg-slate-950/70 px-3 py-2 text-right">
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Preco</p>
        <p className="mt-1 text-xl font-bold text-lime-300">{currencySymbol} {last.close.toFixed(2)}</p>
      </div>
      <div className="absolute bottom-4 left-4 max-w-[260px] rounded-[24px] border border-white/8 bg-slate-950/75 p-4">
        <p className="text-lg font-semibold">Candle atual</p>
        <p className="mt-3 text-sm text-slate-300">Abertura {currencySymbol} {last.open.toFixed(2)}</p>
        <p className="mt-1 text-sm text-slate-300">Max {currencySymbol} {last.high.toFixed(2)} / Min {currencySymbol} {last.low.toFixed(2)}</p>
      </div>
    </div>
  );
}
