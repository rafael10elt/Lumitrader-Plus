"use client";

import { useState } from "react";
import { renewLicense30Days, saveLicense, toggleUserAccess, updateLicenseStatus, updateManagedUser } from "@/app/admin/actions";

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

const PLAN_OPTIONS = ["Starter", "Pro", "Premium", "Enterprise"];
const LICENSE_STATUS_OPTIONS = [
  { value: "ativa", label: "Ativa" },
  { value: "pendente", label: "Pendente" },
  { value: "bloqueada", label: "Bloqueada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "expirada", label: "Expirada" },
];

export function AdminUsersPanel({ users, licenses, accounts }: { users: ManagedUser[]; licenses: ManagedLicense[]; accounts: ManagedAccount[] }) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  return (
    <div className="glass-panel rounded-[32px] p-5">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Usuarios</p>
      <div className="mt-5 grid gap-4">
        {users.length > 0 ? users.map((user) => {
          const userLicenses = licenses.filter((license) => license.user_id === user.id);
          return (
            <div key={user.id} className="rounded-[24px] border border-white/8 bg-white/4 p-4">
              <form>
                <input type="hidden" name="user_id" value={user.id} />
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.8fr_auto_auto] lg:items-end">
                  <Field label="Nome" name="nome" defaultValue={user.nome ?? ""} />
                  <Field label="Email" name="email" type="email" defaultValue={user.email ?? ""} />
                  <Field label="Telegram ID" name="telegram_id" defaultValue={user.telegram_id ?? ""} required={false} />
                  <button formAction={updateManagedUser} className="rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">Salvar</button>
                  <button formAction={toggleUserAccess} formNoValidate name="next_state" value={String(!user.acesso_ativo)} className={`rounded-[18px] px-4 py-3 text-sm font-semibold ${user.acesso_ativo ? "bg-red-400/12 text-red-200" : "bg-lime-400/12 text-lime-200"}`}>{user.acesso_ativo ? "Bloquear" : "Liberar"}</button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Role {user.role} · {userLicenses.length} licenca(s)</p>
                <button type="button" onClick={() => setOpenUserId(user.id)} className="rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">Gerenciar licencas</button>
              </div>

              {openUserId === user.id ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-8">
                  <div className="glass-panel max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-[32px] p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-xs uppercase tracking-[0.3em] text-cyan-200/70">Licencas do usuario</p>
                        <h3 className="mt-2 text-3xl font-semibold">{user.nome ?? user.email ?? "Usuario"}</h3>
                        <p className="mt-2 text-slate-400">Edite, renove ou cadastre novas contas MT5 para este usuario.</p>
                      </div>
                      <button type="button" onClick={() => setOpenUserId(null)} className="rounded-[18px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200">Fechar</button>
                    </div>

                    <form className="mt-6 rounded-[24px] border border-white/8 bg-white/4 p-5">
                      <input type="hidden" name="user_id" value={user.id} />
                      <p className="text-xl font-semibold">Nova licenca</p>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <SelectField label="Plano" name="nome_plano" options={PLAN_OPTIONS.map((plan) => ({ value: plan, label: plan }))} defaultValue="Premium" />
                        <Field label="Numero da conta MT5" name="numero_conta" placeholder="12345678" />
                        <Field label="Servidor MT5" name="mt5_server" placeholder="FTMO-Demo" required={false} />
                        <Field label="Senha MT5" name="mt5_password" type="password" placeholder="Senha da conta" required={false} />
                        <Field label="Valor da licenca (R$)" name="valor" type="number" placeholder="297" required={false} />
                        <Field label="Data de expiracao" name="data_expiracao" type="date" />
                        <SelectField label="Status" name="status" options={LICENSE_STATUS_OPTIONS.filter((item) => item.value !== "expirada")} defaultValue="ativa" />
                      </div>
                      <button formAction={saveLicense} className="mt-5 rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-100">Salvar licenca</button>
                    </form>

                    <div className="mt-6 grid gap-4">
                      {userLicenses.length > 0 ? userLicenses.map((license) => {
                        const account = accounts.find((item) => item.id === license.conta_trading_id);
                        return (
                          <form key={license.id} className="rounded-[24px] border border-white/8 bg-white/4 p-5">
                            <input type="hidden" name="license_id" value={license.id} />
                            <input type="hidden" name="user_id" value={license.user_id} />
                            <div className="grid gap-4 md:grid-cols-2">
                              <SelectField label="Plano" name="nome_plano" options={PLAN_OPTIONS.map((plan) => ({ value: plan, label: plan }))} defaultValue={license.nome_plano} />
                              <Field label="Numero da conta MT5" name="numero_conta" defaultValue={account?.numero_conta ?? ""} />
                              <Field label="Servidor MT5" name="mt5_server" defaultValue={account?.mt5_server ?? ""} required={false} />
                              <Field label="Senha MT5" name="mt5_password" type="password" defaultValue={account?.mt5_password ?? ""} required={false} />
                              <Field label="Valor da licenca (R$)" name="valor" type="number" defaultValue={String(license.valor)} />
                              <Field label="Data de expiracao" name="data_expiracao" type="date" defaultValue={license.data_expiracao} />
                              <SelectField label="Status" name="status" options={LICENSE_STATUS_OPTIONS} defaultValue={license.status} />
                            </div>
                            <div className="mt-4 flex flex-wrap gap-3">
                              <button formAction={saveLicense} className="rounded-[18px] border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm font-semibold text-cyan-100">Salvar licenca</button>
                              <button formAction={renewLicense30Days} formNoValidate name="current_expiration" value={license.data_expiracao} className="rounded-[18px] border border-lime-400/30 bg-lime-400/10 px-4 py-3 text-sm font-semibold text-lime-100">Renovar +30 dias</button>
                              <button formAction={updateLicenseStatus} formNoValidate name="status" value={license.status === "bloqueada" ? "ativa" : "bloqueada"} className={`rounded-[18px] px-4 py-3 text-sm font-semibold ${license.status === "bloqueada" ? "bg-lime-400/12 text-lime-200" : "bg-red-400/12 text-red-200"}`}>{license.status === "bloqueada" ? "Reativar" : "Bloquear"}</button>
                            </div>
                          </form>
                        );
                      }) : <EmptyState text="Este usuario ainda nao possui licencas." />}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        }) : <EmptyState text="Nenhum usuario encontrado para os filtros atuais." />}
      </div>
    </div>
  );
}

function Field({ label, name, placeholder, type = "text", defaultValue, required = true }: { label: string; name: string; placeholder?: string; type?: string; defaultValue?: string; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-sm text-slate-300">{label}</span><input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} required={required} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none placeholder:text-slate-500" /></label>;
}

function SelectField({ label, name, options, defaultValue, required = true }: { label: string; name: string; options: Array<{ value: string; label: string }>; defaultValue?: string; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-sm text-slate-300">{label}</span><select name={name} defaultValue={defaultValue} required={required} className="rounded-[18px] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none">{required ? <option value="">Selecione</option> : null}{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-[24px] border border-white/8 bg-white/4 p-6 text-slate-400">{text}</div>;
}
