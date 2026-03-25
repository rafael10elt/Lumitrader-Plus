import Link from "next/link";
import { createManagedUser, saveLicense, toggleUserAccess, updateLicenseStatus } from "@/app/admin/actions";
import { requireAdminUser } from "@/lib/auth";

type AdminPageProps = {
  searchParams: Promise<{
    message?: string;
    type?: string;
  }>;
};

type ManagedUser = {
  id: string;
  nome: string | null;
  email: string | null;
  role: "admin" | "user";
  acesso_ativo: boolean;
};

type ManagedLicense = {
  id: string;
  user_id: string;
  nome_plano: string;
  status: string;
  valor: number;
  data_expiracao: string;
  conta_trading_id: string;
};

type ManagedAccount = {
  id: string;
  user_id: string;
  nome_cliente: string;
  numero_conta: string;
  corretora: string | null;
  moeda_codigo: string;
  moeda_simbolo: string;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { supabase, profile } = await requireAdminUser();
  const params = await searchParams;
  const message = params.message;
  const isSuccess = params.type === "success";

  const [{ data: users }, { data: licenses }, { data: accounts }] = await Promise.all([
    supabase
      .from("usuarios")
      .select("id, nome, email, role, acesso_ativo")
      .order("criado_em", { ascending: false }),
    supabase
      .from("licencas")
      .select("id, user_id, nome_plano, status, valor, data_expiracao, conta_trading_id")
      .order("data_expiracao", { ascending: true }),
    supabase
      .from("contas_trading")
      .select("id, user_id, nome_cliente, numero_conta, corretora, moeda_codigo, moeda_simbolo")
      .order("criado_em", { ascending: false }),
  ]);

  const managedUsers = (users ?? []) as ManagedUser[];
  const managedLicenses = (licenses ?? []) as ManagedLicense[];
  const managedAccounts = (accounts ?? []) as ManagedAccount[];

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="glass-panel rounded-[32px] p-6">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Gestao SaaS</p>
              <h1 className="mt-2 text-3xl font-semibold">Painel administrativo do Lumitrader</h1>
              <p className="mt-3 max-w-3xl text-slate-300">
                Voce esta autenticado como admin. Aqui ficam o cadastro de usuarios, o controle de licencas por conta MT5
                e o bloqueio granular do SaaS.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Admin</p>
                <p className="mt-2 text-lg font-semibold">{profile.nome ?? profile.email ?? "Administrador"}</p>
              </div>
              <Link href="/dashboard" className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10">
                Voltar ao dashboard
              </Link>
            </div>
          </div>

          {message ? (
            <div className={`mt-5 rounded-[20px] border px-4 py-3 text-sm ${isSuccess ? "border-lime-400/20 bg-lime-400/10 text-lime-200" : "border-red-400/20 bg-red-400/10 text-red-200"}`}>
              {message}
            </div>
          ) : null}

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <form className="rounded-[28px] border border-white/8 bg-white/4 p-5">
              <p className="text-xl font-semibold">Cadastrar usuario</p>
              <div className="mt-4 grid gap-4">
                <Field label="Nome" name="nome" placeholder="Nome do cliente" />
                <Field label="Email" name="email" type="email" placeholder="cliente@exemplo.com" />
                <Field label="Senha inicial" name="password" type="password" placeholder="Senha provisoria" />
              </div>
              <button formAction={createManagedUser} className="mt-5 rounded-[20px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-5 py-3 font-semibold text-slate-950">
                Criar usuario SaaS
              </button>
            </form>

            <form className="rounded-[28px] border border-white/8 bg-white/4 p-5">
              <p className="text-xl font-semibold">Cadastrar ou renovar licenca</p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <SelectField label="Usuario" name="user_id" options={managedUsers.filter((user) => user.role === "user").map((user) => ({ value: user.id, label: `${user.nome ?? "Sem nome"} - ${user.email ?? "sem email"}` }))} />
                <Field label="Plano" name="nome_plano" placeholder="Licenca Premium" />
                <Field label="Nome do cliente" name="nome_cliente" placeholder="Nome da conta MT5" />
                <Field label="Numero da conta MT5" name="numero_conta" placeholder="12345678" />
                <Field label="Corretora" name="corretora" placeholder="IC Markets" />
                <Field label="Moeda codigo" name="moeda_codigo" placeholder="USD" />
                <Field label="Moeda simbolo" name="moeda_simbolo" placeholder="$" />
                <Field label="Valor da licenca" name="valor" type="number" placeholder="297" />
                <Field label="Data de expiracao" name="data_expiracao" type="date" />
                <SelectField label="Status" name="status" options={[{ value: "ativa", label: "Ativa" }, { value: "pendente", label: "Pendente" }, { value: "bloqueada", label: "Bloqueada" }, { value: "cancelada", label: "Cancelada" }]} />
              </div>
              <button formAction={saveLicense} className="mt-5 rounded-[20px] border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 font-semibold text-cyan-100">
                Salvar licenca
              </button>
            </form>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="glass-panel rounded-[32px] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Usuarios</p>
            <div className="mt-5 grid gap-4">
              {managedUsers.map((user) => (
                <div key={user.id} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-lg font-semibold">{user.nome ?? "Sem nome"}</p>
                      <p className="text-sm text-slate-400">{user.email ?? "Sem email"}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-500">Role {user.role}</p>
                    </div>
                    <form className="flex items-center gap-3">
                      <input type="hidden" name="user_id" value={user.id} />
                      <input type="hidden" name="next_state" value={String(!user.acesso_ativo)} />
                      <button formAction={toggleUserAccess} className={`rounded-[18px] px-4 py-2 text-sm font-semibold ${user.acesso_ativo ? "bg-red-400/12 text-red-200" : "bg-lime-400/12 text-lime-200"}`}>
                        {user.acesso_ativo ? "Bloquear usuario" : "Liberar usuario"}
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-[32px] p-5">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Licencas por conta</p>
            <div className="mt-5 grid gap-4">
              {managedLicenses.map((license) => {
                const account = managedAccounts.find((item) => item.id === license.conta_trading_id);
                const user = managedUsers.find((item) => item.id === license.user_id);

                return (
                  <div key={license.id} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
                    <p className="text-lg font-semibold">{license.nome_plano}</p>
                    <p className="mt-1 text-sm text-slate-400">{user?.nome ?? "Usuario"} · Conta {account?.numero_conta ?? "--"}</p>
                    <p className="mt-1 text-sm text-slate-400">Expira em {license.data_expiracao} · Valor {license.valor}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {[
                        { value: "ativa", label: "Ativar" },
                        { value: "bloqueada", label: "Bloquear" },
                        { value: "cancelada", label: "Cancelar" },
                      ].map((option) => (
                        <form key={option.value}>
                          <input type="hidden" name="license_id" value={license.id} />
                          <input type="hidden" name="status" value={option.value} />
                          <button formAction={updateLicenseStatus} className={`rounded-[18px] px-4 py-2 text-sm font-semibold ${license.status === option.value ? "bg-lime-400/12 text-lime-200" : "bg-white/6 text-slate-200"}`}>
                            {option.label}
                          </button>
                        </form>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <input name={name} type={type} placeholder={placeholder} required={type !== "date"} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none placeholder:text-slate-500" />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <select name={name} required className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none">
        <option value="">Selecione</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
