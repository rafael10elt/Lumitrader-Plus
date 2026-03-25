import Link from "next/link";
import { redirect } from "next/navigation";
import { login, signup } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{
    message?: string;
    type?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const message = params.message;
  const isSuccess = params.type === "success";

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="glass-panel relative overflow-hidden rounded-[32px] p-6 sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(157,232,51,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.16),transparent_28%)]" />
          <div className="relative">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-lime-400/12 text-2xl font-bold text-lime-300 glow-ring">
                L
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.32em] text-cyan-200/70">
                  Plataforma de Trading Algoritmico
                </p>
                <h1 className="font-mono text-3xl font-bold tracking-tight sm:text-4xl">
                  Lumitrader
                </h1>
              </div>
            </div>

            <div className="mt-10 max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.32em] text-lime-300/80">
                Acesso protegido
              </p>
              <h2 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">
                Controle algoritmico com autenticacao real e painel em tempo real.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                Esta etapa ja deixa o Lumitrader pronto para proteger usuarios, persistir
                sessao no App Router e preparar o fluxo vivo de conta MT5, operacoes,
                saldo e equity.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <FeatureCard
                title="Auth SSR"
                description="Cookies seguros e paginas protegidas com Supabase no Next.js."
              />
              <FeatureCard
                title="Conta MT5"
                description="Painel preparado para numero da conta, cliente, saldo e equity."
              />
              <FeatureCard
                title="Realtime"
                description="Estrutura pronta para assinaturas ao vivo de conta e operacoes."
              />
            </div>

            <div className="mt-8 rounded-[28px] border border-white/8 bg-slate-950/35 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-200/70">
                Proxima camada
              </p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-200">
                <li className="rounded-[20px] border border-white/8 bg-white/4 px-4 py-3">
                  Webhooks MT5 -&gt; Python -&gt; n8n -&gt; Supabase.
                </li>
                <li className="rounded-[20px] border border-white/8 bg-white/4 px-4 py-3">
                  Candles estilo MT5 com atualizacao em tempo real.
                </li>
                <li className="rounded-[20px] border border-white/8 bg-white/4 px-4 py-3">
                  Auditoria operacional com logs e validacao por IA sob demanda.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[32px] p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-200/70">
                Entrar no sistema
              </p>
              <h2 className="mt-2 text-3xl font-semibold">Sua mesa operacional</h2>
            </div>
            <span className="rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-sm text-lime-300">
              Supabase Auth
            </span>
          </div>

          {message ? (
            <div
              className={`mt-6 rounded-[22px] border px-4 py-3 text-sm ${
                isSuccess
                  ? "border-lime-400/20 bg-lime-400/10 text-lime-200"
                  : "border-red-400/20 bg-red-400/10 text-red-200"
              }`}
            >
              {message}
            </div>
          ) : null}

          <div className="mt-6 grid gap-5">
            <form className="rounded-[28px] border border-white/8 bg-white/4 p-5">
              <p className="text-lg font-semibold">Entrar</p>
              <div className="mt-4 grid gap-4">
                <AuthField label="Email" name="email" type="email" placeholder="voce@lumitrader.com" />
                <AuthField label="Senha" name="password" type="password" placeholder="Sua senha" />
              </div>
              <button
                formAction={login}
                className="mt-5 flex w-full items-center justify-center rounded-[20px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-4 py-3 text-base font-semibold text-slate-950 transition-transform hover:-translate-y-0.5"
              >
                Acessar dashboard
              </button>
            </form>

            <form className="rounded-[28px] border border-white/8 bg-white/4 p-5">
              <p className="text-lg font-semibold">Criar conta</p>
              <div className="mt-4 grid gap-4">
                <AuthField label="Nome do cliente" name="name" type="text" placeholder="Seu nome" />
                <AuthField label="Email" name="email" type="email" placeholder="voce@lumitrader.com" />
                <AuthField label="Senha" name="password" type="password" placeholder="Crie uma senha" />
              </div>
              <button
                formAction={signup}
                className="mt-5 flex w-full items-center justify-center rounded-[20px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-base font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/16"
              >
                Criar acesso seguro
              </button>
            </form>
          </div>

          <p className="mt-6 text-sm leading-6 text-slate-400">
            Quando o cadastro for confirmado por email, o dashboard passa a carregar os
            dados do usuario autenticado e a conta de trading vinculada.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            Deploy previsto para Netlify. Depois dessa etapa, seguimos para os webhooks
            operacionais e realtime.
          </p>
          <div className="mt-6 text-sm text-slate-400">
            Se precisar voltar para o inicio, use <Link href="/" className="text-lime-300">/</Link>.
          </div>
        </section>
      </div>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/4 p-4">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-cyan-200/70">{title}</p>
      <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
    </div>
  );
}

function AuthField({
  label,
  name,
  type,
  placeholder,
}: {
  label: string;
  name: string;
  type: string;
  placeholder: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required
        className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none transition-colors placeholder:text-slate-500 focus:border-lime-400/40"
      />
    </label>
  );
}
