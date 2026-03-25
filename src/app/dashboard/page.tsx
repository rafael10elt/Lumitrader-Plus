import Link from "next/link";
import { redirect } from "next/navigation";
import { signout } from "@/app/login/actions";
import { DashboardRealtime } from "@/components/dashboard/dashboard-realtime";
import { SignoutButton } from "@/components/auth/signout-button";
import { requireAuthenticatedUser } from "@/lib/auth";
import type { MarketCandle } from "@/lib/backend/types";

type DashboardPageProps = {
  searchParams: Promise<{
    account?: string;
    from?: string;
    to?: string;
    type?: string;
    result?: string;
  }>;
};

export type DashboardLicense = {
  id: string;
  user_id: string;
  conta_trading_id: string;
  nome_plano: string;
  status: "ativa" | "expirada" | "bloqueada" | "cancelada" | "pendente";
  valor: number;
  data_expiracao: string;
};

export type DashboardAccount = {
  id: string;
  user_id: string;
  nome_cliente: string;
  numero_conta: string;
  corretora: string | null;
  moeda_codigo: string;
  moeda_simbolo: string;
  saldo_atual: number;
  equity: number;
  margem_livre: number | null;
  nivel_margem: number | null;
  ativo: boolean;
  atualizado_em: string;
  server_time: string | null;
  mercado_snapshot: {
    notes?: string[];
    candles?: MarketCandle[];
  } | null;
  insight_atual: string | null;
  ultima_sincronizacao: string | null;
};

export type DashboardConfig = {
  id?: string;
  conta_trading_id: string;
  ativo: string;
  timeframe: string;
  sistema_ligado: boolean;
  modo: "agressivo" | "conservador";
  breakeven_ativo: boolean;
  trailing_stop_ativo: boolean;
  horario_inicio: string;
  horario_fim: string;
  meta_lucro_diaria: number;
  perda_maxima_diaria: number;
  limite_operacoes_ativo: boolean;
  limite_operacoes_diaria: number | null;
};

export type DashboardStats = {
  conta_trading_id: string;
  operacoes_total: number;
  vitorias: number;
  derrotas: number;
  win_rate: number;
  lucro_total: number;
  prejuizo_total: number;
  drawdown: number;
  melhor_operacao: number;
  pior_operacao: number;
};

export type DashboardHistoryRow = {
  id: string;
  time: string;
  type: string;
  lot: string;
  entry: string;
  result: string;
  resultTone: string;
};

export type DashboardHistoryFilters = {
  from: string;
  to: string;
  type: string;
  result: string;
};

export type DashboardOpenOperation = {
  id: string;
  direction: "buy" | "sell";
  lot: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  openedAt: string;
  timeframe: string;
  symbol: string;
  profitLoss: number;
};

export type DashboardInsightBundle = {
  summary: string | null;
  notes: string[];
  candles: MarketCandle[];
};

export type DashboardCommandStatus = {
  id: string;
  tipo: "open_buy" | "open_sell" | "close_position";
  status: "pending" | "processing" | "executed" | "failed" | "cancelled";
  erro: string | null;
  solicitado_em: string;
  processado_em: string | null;
};

function normalizeLicenseStatus(license: DashboardLicense) {
  const today = new Date().toISOString().slice(0, 10);
  if (license.status === "ativa" && license.data_expiracao < today) {
    return "expirada" as const;
  }
  return license.status;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { supabase, profile } = await requireAuthenticatedUser();
  const params = await searchParams;

  if (!profile.acesso_ativo) {
    return <BlockedState title="Acesso do usuario bloqueado" description="Seu acesso ao SaaS foi desativado pelo administrador. Entre em contato para regularizacao." canManage={profile.role === "admin"} />;
  }

  const [{ data: accounts }, { data: licenses }] = await Promise.all([
    supabase
      .from("contas_trading")
      .select("id, user_id, nome_cliente, numero_conta, corretora, moeda_codigo, moeda_simbolo, saldo_atual, equity, margem_livre, nivel_margem, ativo, atualizado_em, server_time, mercado_snapshot, insight_atual, ultima_sincronizacao")
      .eq("user_id", profile.id)
      .order("criado_em", { ascending: false }),
    supabase
      .from("licencas")
      .select("id, user_id, conta_trading_id, nome_plano, status, valor, data_expiracao")
      .eq("user_id", profile.id)
      .order("data_expiracao", { ascending: true }),
  ]);

  const validAccounts = ((accounts ?? []) as DashboardAccount[])
    .map((account) => {
      const license = ((licenses ?? []) as DashboardLicense[]).find((item) => item.conta_trading_id === account.id);
      if (!license) {
        return null;
      }
      const normalizedStatus = normalizeLicenseStatus(license);
      if (normalizedStatus !== "ativa") {
        return null;
      }
      return {
        ...account,
        license: {
          ...license,
          status: normalizedStatus,
        },
      };
    })
    .filter(Boolean) as Array<DashboardAccount & { license: DashboardLicense }>;

  if (validAccounts.length === 0) {
    if (profile.role === "admin") {
      return <BlockedState title="Nenhuma conta licenciada para este admin" description="Voce ja pode operar o SaaS, mas precisa que a sua propria conta tambem tenha uma licenca ativa se quiser testar o dashboard operacional com o usuario admin." canManage />;
    }

    return <BlockedState title="Nenhuma licenca ativa disponivel" description="Este usuario nao possui conta MT5 licenciada no momento. O dashboard fica bloqueado ate que exista ao menos uma licenca valida." canManage={false} />;
  }

  const selectedAccount = validAccounts.find((item) => item.id === params.account) ?? validAccounts[0];
  if (!selectedAccount) {
    redirect("/dashboard");
  }

  const selectedLicense = selectedAccount.license;
  const historyFilters: DashboardHistoryFilters = {
    from: params.from ?? "",
    to: params.to ?? "",
    type: params.type ?? "all",
    result: params.result ?? "all",
  };

  const configQuery = supabase
    .from("configuracoes_sessao")
    .select("id, conta_trading_id, ativo, timeframe, sistema_ligado, modo, breakeven_ativo, trailing_stop_ativo, horario_inicio, horario_fim, meta_lucro_diaria, perda_maxima_diaria, limite_operacoes_ativo, limite_operacoes_diaria")
    .eq("user_id", profile.id)
    .eq("conta_trading_id", selectedAccount.id)
    .order("atualizado_em", { ascending: false })
    .limit(1)
    .maybeSingle<DashboardConfig>();

  const statsQuery = supabase
    .from("estatisticas")
    .select("conta_trading_id, operacoes_total, vitorias, derrotas, win_rate, lucro_total, prejuizo_total, drawdown, melhor_operacao, pior_operacao")
    .eq("user_id", profile.id)
    .eq("conta_trading_id", selectedAccount.id)
    .order("periodo", { ascending: false })
    .limit(1)
    .maybeSingle<DashboardStats>();

  const openOperationQuery = supabase
    .from("operacoes")
    .select("id, direcao, lote, preco_entrada, stop_loss, take_profit, lucro_prejuizo, aberta_em, timeframe, ativo")
    .eq("user_id", profile.id)
    .eq("conta_trading_id", selectedAccount.id)
    .eq("status", "aberta")
    .order("aberta_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const commandStatusQuery = supabase
    .from("comandos_trading")
    .select("id, tipo, status, erro, solicitado_em, processado_em")
    .eq("user_id", profile.id)
    .eq("conta_trading_id", selectedAccount.id)
    .order("solicitado_em", { ascending: false })
    .limit(5);

  let operationsQuery = supabase
    .from("operacoes")
    .select("id, direcao, status, lote, preco_entrada, preco_saida, stop_loss, take_profit, lucro_prejuizo, aberta_em, fechada_em, timeframe, ativo, validacao_ia")
    .eq("user_id", profile.id)
    .eq("conta_trading_id", selectedAccount.id)
    .order("aberta_em", { ascending: false })
    .limit(50);

  if (historyFilters.from) {
    operationsQuery = operationsQuery.gte("aberta_em", `${historyFilters.from}T00:00:00.000Z`);
  }
  if (historyFilters.to) {
    operationsQuery = operationsQuery.lte("aberta_em", `${historyFilters.to}T23:59:59.999Z`);
  }
  if (historyFilters.type === "compra") {
    operationsQuery = operationsQuery.eq("direcao", "compra");
  }
  if (historyFilters.type === "venda") {
    operationsQuery = operationsQuery.eq("direcao", "venda");
  }
  if (historyFilters.result === "gain") {
    operationsQuery = operationsQuery.gt("lucro_prejuizo", 0);
  }
  if (historyFilters.result === "loss") {
    operationsQuery = operationsQuery.lt("lucro_prejuizo", 0);
  }

  const [{ data: config }, { data: stats }, { data: operations }, { data: openOperation }, { data: commandStatuses }] = await Promise.all([configQuery, statsQuery, operationsQuery, openOperationQuery, commandStatusQuery]);

  const resolvedConfig: DashboardConfig = config ?? {
    conta_trading_id: selectedAccount.id,
    ativo: profile.ativo_padrao,
    timeframe: profile.timeframe_padrao,
    sistema_ligado: false,
    modo: "agressivo",
    breakeven_ativo: true,
    trailing_stop_ativo: true,
    horario_inicio: "09:00:00",
    horario_fim: "17:00:00",
    meta_lucro_diaria: 1000,
    perda_maxima_diaria: 500,
    limite_operacoes_ativo: false,
    limite_operacoes_diaria: null,
  };

  const resolvedStats: DashboardStats = stats ?? {
    conta_trading_id: selectedAccount.id,
    operacoes_total: 0,
    vitorias: 0,
    derrotas: 0,
    win_rate: 0,
    lucro_total: 0,
    prejuizo_total: 0,
    drawdown: 0,
    melhor_operacao: 0,
    pior_operacao: 0,
  };

  const latestOperationWithAi = (operations ?? []).find((operation) => operation.validacao_ia);
  const accountNotes = Array.isArray(selectedAccount.mercado_snapshot?.notes) ? selectedAccount.mercado_snapshot.notes : [];
  const accountCandles = Array.isArray(selectedAccount.mercado_snapshot?.candles) ? selectedAccount.mercado_snapshot.candles : [];
  const insightBundle: DashboardInsightBundle = {
    summary: selectedAccount.insight_atual ?? (typeof latestOperationWithAi?.validacao_ia?.ai?.summary === "string" ? latestOperationWithAi.validacao_ia.ai.summary : null),
    notes: accountNotes.length > 0 ? accountNotes : (Array.isArray(latestOperationWithAi?.validacao_ia?.market?.notes) ? latestOperationWithAi.validacao_ia.market.notes : []),
    candles: accountCandles.length > 0 ? accountCandles : (Array.isArray(latestOperationWithAi?.validacao_ia?.market?.candles) ? latestOperationWithAi.validacao_ia.market.candles : []),
  };

  const resolvedOpenOperation: DashboardOpenOperation | null = openOperation ? {
    id: openOperation.id,
    direction: openOperation.direcao === "compra" ? "buy" : "sell",
    lot: Number(openOperation.lote),
    entryPrice: Number(openOperation.preco_entrada),
    stopLoss: openOperation.stop_loss != null ? Number(openOperation.stop_loss) : null,
    takeProfit: openOperation.take_profit != null ? Number(openOperation.take_profit) : null,
    openedAt: openOperation.aberta_em,
    timeframe: openOperation.timeframe,
    symbol: openOperation.ativo,
    profitLoss: Number(openOperation.lucro_prejuizo ?? 0),
  } : null;

  const resolvedHistory: DashboardHistoryRow[] = operations?.length
    ? operations.filter((operation) => operation.status !== "aberta").map((operation) => {
        const resultValue = Number(operation.lucro_prejuizo ?? 0);
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
      })
    : [];

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="glass-panel rounded-[32px] p-4 sm:p-6">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-lime-400/12 text-2xl text-lime-300 glow-ring">L</div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.32em] text-cyan-200/70">Plataforma SaaS de Trading</p>
                <h1 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">Lumitrader</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Usuario</p>
                <p className="mt-2 text-lg font-semibold">{profile.nome ?? profile.email ?? "Trader"}</p>
              </div>
              {profile.role === "admin" ? (
                <Link href="/admin" className="rounded-[22px] border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">
                  Gestao SaaS
                </Link>
              ) : null}
              <SignoutButton action={signout} className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10" />
            </div>
          </div>

          <DashboardRealtime
            profile={profile}
            accounts={validAccounts}
            selectedAccountId={selectedAccount.id}
            selectedLicense={selectedLicense}
            account={selectedAccount}
            config={resolvedConfig}
            stats={resolvedStats}
            history={resolvedHistory}
            historyFilters={historyFilters}
            insightBundle={insightBundle}
            openOperation={resolvedOpenOperation}
            commandStatuses={(commandStatuses ?? []) as DashboardCommandStatus[]}
          />
        </section>
      </div>
    </main>
  );
}

function BlockedState({ title, description, canManage }: { title: string; description: string; canManage: boolean }) {
  return (
    <main className="min-h-screen px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl items-center">
        <section className="glass-panel w-full rounded-[32px] p-8">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-red-200/80">Acesso bloqueado</p>
          <h1 className="mt-4 text-4xl font-semibold">{title}</h1>
          <p className="mt-4 max-w-2xl text-slate-300">{description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SignoutButton action={signout} label="Voltar ao login" className="rounded-[20px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-5 py-3 font-semibold text-slate-950" />
            {canManage ? (
              <Link href="/admin" className="rounded-[20px] border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 font-semibold text-cyan-100">Abrir gestao SaaS</Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
