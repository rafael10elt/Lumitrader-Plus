import Link from "next/link";
import { createManagedUser } from "@/app/admin/actions";
import { AdminUsersPanel } from "@/components/admin/admin-users-panel";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const PLAN_OPTIONS = ["Starter", "Pro", "Premium", "Enterprise"];
const LICENSE_STATUS_OPTIONS = [
  { value: "ativa", label: "Ativa" },
  { value: "pendente", label: "Pendente" },
  { value: "bloqueada", label: "Bloqueada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "expirada", label: "Expirada" },
];

type AdminPageProps = {
  searchParams: Promise<{
    message?: string;
    type?: string;
    query?: string;
    plan?: string;
    status?: string;
  }>;
};

type ManagedUser = {
  id: string;
  nome: string | null;
  email: string | null;
  telegram_id: string | null;
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
  mt5_server: string | null;
  mt5_password: string | null;
};

function normalizedLicenseStatus(status: string, expirationDate: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (status === "ativa" && expirationDate < today) {
    return "expirada";
  }
  return status;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const { supabase, profile } = await requireAdminUser();
  const params = await searchParams;
  const message = params.message;
  const isSuccess = params.type === "success";
  const query = (params.query ?? "").toLowerCase();
  const planFilter = params.plan ?? "all";
  const statusFilter = params.status ?? "all";

  const [{ data: users }, { data: licenses }, { data: accounts }] = await Promise.all([
    supabase.from("usuarios").select("id, nome, email, telegram_id, role, acesso_ativo").order("criado_em", { ascending: false }),
    supabase.from("licencas").select("id, user_id, nome_plano, status, valor, data_expiracao, conta_trading_id").order("data_expiracao", { ascending: true }),
    supabase.from("contas_trading").select("id, user_id, nome_cliente, numero_conta, mt5_server, mt5_password").order("criado_em", { ascending: false }),
  ]);

  const expiredIds = (licenses ?? [])
    .filter((license) => normalizedLicenseStatus(license.status, license.data_expiracao) === "expirada" && license.status !== "expirada")
    .map((license) => license.id);

  if (expiredIds.length > 0) {
    const adminClient = createAdminClient();
    await adminClient.from("licencas").update({ status: "expirada" }).in("id", expiredIds);
  }

  const managedUsers = (users ?? []) as ManagedUser[];
  const managedLicenses = ((licenses ?? []) as ManagedLicense[]).map((license) => ({ ...license, status: normalizedLicenseStatus(license.status, license.data_expiracao) }));
  const managedAccounts = (accounts ?? []) as ManagedAccount[];

  const filteredUserIds = new Set(
    managedUsers
      .filter((user) => !query || [user.nome ?? "", user.email ?? "", user.telegram_id ?? ""].some((value) => value.toLowerCase().includes(query)))
      .map((user) => user.id),
  );

  const filteredLicenses = managedLicenses.filter((license) => {
    const account = managedAccounts.find((item) => item.id === license.conta_trading_id);
    const user = managedUsers.find((item) => item.id === license.user_id);
    const matchesQuery = !query || [user?.nome ?? "", user?.email ?? "", account?.numero_conta ?? "", account?.mt5_server ?? ""].some((value) => value.toLowerCase().includes(query));
    const matchesPlan = planFilter === "all" || license.nome_plano === planFilter;
    const matchesStatus = statusFilter === "all" || license.status === statusFilter;
    return matchesQuery && matchesPlan && matchesStatus;
  });

  const filteredUsers = managedUsers.filter((user) => {
    if (filteredUserIds.has(user.id)) {
      return true;
    }
    return filteredLicenses.some((license) => license.user_id === user.id);
  });

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="glass-panel rounded-[32px] p-6">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Gestao SaaS</p>
              <h1 className="mt-2 text-3xl font-semibold">Painel administrativo do Lumitrader</h1>
              <p className="mt-3 max-w-3xl text-slate-300">Cadastro de usuarios, licencas por conta MT5, filtros reais e edicao centralizada por usuario.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-[24px] border border-white/8 bg-white/4 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Admin</p>
                <p className="mt-2 text-lg font-semibold">{profile.nome ?? profile.email ?? "Administrador"}</p>
              </div>
              <Link href="/dashboard" className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10">Voltar ao dashboard</Link>
            </div>
          </div>

          {message ? <div className={`mt-5 rounded-[20px] border px-4 py-3 text-sm ${isSuccess ? "border-lime-400/20 bg-lime-400/10 text-lime-200" : "border-red-400/20 bg-red-400/10 text-red-200"}`}>{message}</div> : null}

          <form method="get" action="/admin" className="mt-5 grid gap-4 rounded-[24px] border border-white/8 bg-white/4 p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
            <Field label="Buscar" name="query" placeholder="Nome, email, telegram, conta ou servidor" defaultValue={params.query ?? ""} required={false} />
            <SelectField label="Plano" name="plan" options={[{ value: "all", label: "Todos" }, ...PLAN_OPTIONS.map((plan) => ({ value: plan, label: plan }))]} defaultValue={planFilter} required={false} />
            <SelectField label="Status" name="status" options={[{ value: "all", label: "Todos" }, ...LICENSE_STATUS_OPTIONS]} defaultValue={statusFilter} required={false} />
            <div className="flex items-end gap-3"><button className="rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">Filtrar</button></div>
          </form>

          <form className="mt-6 rounded-[28px] border border-white/8 bg-white/4 p-5">
            <p className="text-xl font-semibold">Cadastrar usuario</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Nome" name="nome" placeholder="Nome do cliente" />
              <Field label="Email" name="email" type="email" placeholder="cliente@exemplo.com" />
              <Field label="Telegram ID" name="telegram_id" placeholder="123456789" required={false} />
              <Field label="Senha inicial" name="password" type="password" placeholder="Senha provisoria" />
            </div>
            <button formAction={createManagedUser} className="mt-5 rounded-[20px] bg-linear-to-r from-lime-500 via-lime-400 to-emerald-400 px-5 py-3 font-semibold text-slate-950">Criar usuario SaaS</button>
          </form>
        </section>

        <AdminUsersPanel users={filteredUsers} licenses={filteredLicenses} accounts={managedAccounts} />
      </div>
    </main>
  );
}

function Field({ label, name, placeholder, type = "text", defaultValue, required = true }: { label: string; name: string; placeholder?: string; type?: string; defaultValue?: string; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-sm text-slate-300">{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none placeholder:text-slate-500" /></label>;
}

function SelectField({ label, name, options, defaultValue, required = true }: { label: string; name: string; options: Array<{ value: string; label: string }>; defaultValue?: string; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-sm text-slate-300">{label}</span><select name={name} defaultValue={defaultValue} required={required} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none">{required ? <option value="">Selecione</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
