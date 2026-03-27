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
                Painel operacional com autenticação real, bridge MT5 e validação por IA.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                O login protege o acesso ao dashboard, mantém sessão SSR com Supabase e libera o fluxo operacional da conta licenciada vinculada ao usuário.
              </p>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <FeatureCard
                title="Auth SSR"
                description="Sessão segura com Supabase, cookies protegidos e páginas fechadas por usuário autenticado."
              />
              <FeatureCard
                title="Painel Vivo"
                description="Dashboard ligado a conta MT5, comandos operacionais, estatísticas e leitura de mercado."
              />
              <FeatureCard
                title="IA Assistida"
                description="Automação com travas de risco, validação contextual por IA e sincronização em tempo real."
              />
            </div>

            <div className="mt-8 rounded-[28px] border border-white/8 bg-slate-950/35 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-cyan-200/70">
                Capacidades atuais
              </p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-200">
                <li className="rounded-[20px] border border-white/8 bg-white/4 px-4 py-3">
                  Bridge MT5 com sincronização de saldo, equity, posições e comandos.
                </li>
                <li className="rounded-[20px] border border-white/8 bg-white/4 px-4 py-3">
                  Dashboard com polling de segurança e atualização via Supabase Realtime.
                </li>
                <li className="rounded-[20px] border border-white/8 bg-white/4 px-4 py-3">
                  Regras de risco, posição única por conta e validação operacional por IA.
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
            Após confirmar o email, o usuário autenticado passa a acessar apenas o dashboard e os recursos permitidos pelo vínculo com sua conta e licença.
          </p>
          <p className="mt-3 text-sm text-slate-500">
            O acesso operacional também depende do cadastro da conta MT5, licença ativa e parâmetros configurados no ambiente administrativo.
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
