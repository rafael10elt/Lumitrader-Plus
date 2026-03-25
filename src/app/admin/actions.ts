"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string) {
  const value = Number(textValue(formData, key));
  return Number.isFinite(value) ? value : 0;
}

function optionalIntegerValue(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? Math.trunc(value) : null;
}

function normalizeDateValue(value: string) {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  return value;
}

const PLAN_DEFAULTS: Record<string, number> = {
  Starter: 97,
  Pro: 197,
  Premium: 297,
  Enterprise: 497,
};

function resolveLicenseStatus(status: string, expirationDate: string) {
  const today = new Date().toISOString().slice(0, 10);
  if (status === "ativa" && expirationDate < today) {
    return "expirada";
  }
  return status;
}

function nextExpirationDate(currentDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parsedCurrent = currentDate ? new Date(`${currentDate}T00:00:00`) : null;
  const base = parsedCurrent && parsedCurrent > today ? parsedCurrent : today;
  base.setDate(base.getDate() + 30);
  return base.toISOString().slice(0, 10);
}

export async function createManagedUser(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const nome = textValue(formData, "nome");
  const email = textValue(formData, "email");
  const password = textValue(formData, "password");
  const telegramId = textValue(formData, "telegram_id");

  if (!nome || !email || !password) {
    redirect("/admin?message=Preencha+nome%2C+email+e+senha.&type=error");
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nome,
    },
  });

  if (error || !data.user) {
    redirect(`/admin?message=${encodeURIComponent(error?.message ?? "Nao foi possivel criar o usuario.")}&type=error`);
  }

  await adminClient
    .from("usuarios")
    .update({
      nome,
      email,
      telegram_id: telegramId || null,
      role: "user",
      acesso_ativo: true,
    })
    .eq("id", data.user.id);

  revalidatePath("/admin");
  redirect("/admin?message=Usuario+criado+com+sucesso.&type=success");
}

export async function updateManagedUser(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const userId = textValue(formData, "user_id");
  const nome = textValue(formData, "nome");
  const email = textValue(formData, "email");
  const telegramId = textValue(formData, "telegram_id");

  await adminClient.from("usuarios").update({ nome, email, telegram_id: telegramId || null }).eq("id", userId);

  revalidatePath("/admin");
  redirect("/admin?message=Dados+do+usuario+atualizados.&type=success");
}

export async function saveLicense(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const licenseId = textValue(formData, "license_id");
  const userId = textValue(formData, "user_id");
  const numeroConta = textValue(formData, "numero_conta");
  const mt5Server = textValue(formData, "mt5_server");
  const mt5Password = textValue(formData, "mt5_password");
  const valorInput = textValue(formData, "valor");
  const dataExpiracao = normalizeDateValue(textValue(formData, "data_expiracao"));
  const alavancagem = optionalIntegerValue(formData, "alavancagem");
  const requestedStatus = textValue(formData, "status") || "ativa";
  const nomePlano = textValue(formData, "nome_plano") || "Premium";
  const valor = valorInput ? numberValue(formData, "valor") : (PLAN_DEFAULTS[nomePlano] ?? 297);
  const status = resolveLicenseStatus(requestedStatus, dataExpiracao);

  if (!userId || !numeroConta || !dataExpiracao) {
    redirect("/admin?message=Preencha+usuario%2C+numero+da+conta+e+expiracao.&type=error");
  }

  const { data: existingUser } = await adminClient
    .from("usuarios")
    .select("nome")
    .eq("id", userId)
    .maybeSingle<{ nome: string | null }>();

  const { data: existingAccount } = await adminClient
    .from("contas_trading")
    .select("id")
    .eq("user_id", userId)
    .eq("numero_conta", numeroConta)
    .maybeSingle<{ id: string }>();

  let accountId = existingAccount?.id;

  const accountPayload = {
    numero_conta: numeroConta,
    mt5_server: mt5Server || null,
    alavancagem,
  } as const;

  if (!accountId && licenseId) {
    const { data: licenseAccount } = await adminClient
      .from("licencas")
      .select("conta_trading_id")
      .eq("id", licenseId)
      .maybeSingle<{ conta_trading_id: string }>();

    if (licenseAccount?.conta_trading_id) {
      accountId = licenseAccount.conta_trading_id;
      const accountUpdatePayload = mt5Password
        ? { ...accountPayload, mt5_password: mt5Password }
        : accountPayload;

      await adminClient
        .from("contas_trading")
        .update(accountUpdatePayload)
        .eq("id", accountId);
    }
  }

  if (accountId) {
    const accountUpdatePayload = mt5Password
      ? { ...accountPayload, mt5_password: mt5Password }
      : accountPayload;

    const { error: updateAccountError } = await adminClient
      .from("contas_trading")
      .update(accountUpdatePayload)
      .eq("id", accountId);

    if (updateAccountError) {
      redirect(`/admin?message=${encodeURIComponent(updateAccountError.message)}&type=error`);
    }
  } else {
    const { data: createdAccount, error: accountError } = await adminClient
      .from("contas_trading")
      .insert({
        user_id: userId,
        nome_cliente: existingUser?.nome ?? "Cliente Lumitrader",
        corretora: null,
        moeda_codigo: "USD",
        moeda_simbolo: "$",
        mt5_password: mt5Password || null,
        ...accountPayload,
      })
      .select("id")
      .single<{ id: string }>();

    if (accountError || !createdAccount) {
      redirect(`/admin?message=${encodeURIComponent(accountError?.message ?? "Nao foi possivel criar a conta MT5.")}&type=error`);
    }

    accountId = createdAccount.id;
  }

  if (licenseId) {
    const { error: licenseUpdateError } = await adminClient
      .from("licencas")
      .update({
        nome_plano: nomePlano,
        status,
        valor,
        data_expiracao: dataExpiracao,
      })
      .eq("id", licenseId);

    if (licenseUpdateError) {
      redirect(`/admin?message=${encodeURIComponent(licenseUpdateError.message)}&type=error`);
    }
  } else {
    const { error: licenseInsertError } = await adminClient.from("licencas").insert({
      user_id: userId,
      conta_trading_id: accountId,
      nome_plano: nomePlano,
      status,
      valor,
      data_expiracao: dataExpiracao,
    });

    if (licenseInsertError) {
      redirect(`/admin?message=${encodeURIComponent(licenseInsertError.message)}&type=error`);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Licenca+salva+com+sucesso.&type=success");
}

export async function renewLicense30Days(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const licenseId = textValue(formData, "license_id");
  const currentDate = normalizeDateValue(textValue(formData, "current_expiration"));
  await adminClient
    .from("licencas")
    .update({
      data_expiracao: nextExpirationDate(currentDate),
      status: "ativa",
    })
    .eq("id", licenseId);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Licenca+renovada+por+30+dias.&type=success");
}

export async function toggleUserAccess(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const userId = textValue(formData, "user_id");
  const nextState = textValue(formData, "next_state") === "true";

  await adminClient.from("usuarios").update({ acesso_ativo: nextState }).eq("id", userId);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Acesso+do+usuario+atualizado.&type=success");
}

export async function updateLicenseStatus(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const licenseId = textValue(formData, "license_id");
  const requestedStatus = textValue(formData, "status");
  const expirationDate = normalizeDateValue(textValue(formData, "data_expiracao"));
  const status = resolveLicenseStatus(requestedStatus, expirationDate);

  await adminClient.from("licencas").update({ status }).eq("id", licenseId);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Status+da+licenca+atualizado.&type=success");
}
