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

export async function createManagedUser(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const nome = textValue(formData, "nome");
  const email = textValue(formData, "email");
  const password = textValue(formData, "password");

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
      role: "user",
      acesso_ativo: true,
    })
    .eq("id", data.user.id);

  revalidatePath("/admin");
  redirect("/admin?message=Usuario+criado+com+sucesso.&type=success");
}

export async function saveLicense(formData: FormData) {
  await requireAdminUser();
  const adminClient = createAdminClient();

  const userId = textValue(formData, "user_id");
  const nomeCliente = textValue(formData, "nome_cliente");
  const numeroConta = textValue(formData, "numero_conta");
  const corretora = textValue(formData, "corretora");
  const moedaCodigo = textValue(formData, "moeda_codigo") || "USD";
  const moedaSimbolo = textValue(formData, "moeda_simbolo") || "$";
  const valor = numberValue(formData, "valor");
  const dataExpiracao = textValue(formData, "data_expiracao");
  const status = textValue(formData, "status") || "ativa";
  const nomePlano = textValue(formData, "nome_plano") || "Licenca Padrao";

  if (!userId || !nomeCliente || !numeroConta || !dataExpiracao) {
    redirect("/admin?message=Preencha+usuario%2C+cliente%2C+conta+e+expiracao.&type=error");
  }

  const { data: existingAccount } = await adminClient
    .from("contas_trading")
    .select("id")
    .eq("user_id", userId)
    .eq("numero_conta", numeroConta)
    .maybeSingle<{ id: string }>();

  let accountId = existingAccount?.id;

  if (accountId) {
    await adminClient
      .from("contas_trading")
      .update({
        nome_cliente: nomeCliente,
        corretora: corretora || null,
        moeda_codigo: moedaCodigo,
        moeda_simbolo: moedaSimbolo,
      })
      .eq("id", accountId);
  } else {
    const { data: createdAccount, error: accountError } = await adminClient
      .from("contas_trading")
      .insert({
        user_id: userId,
        nome_cliente: nomeCliente,
        numero_conta: numeroConta,
        corretora: corretora || null,
        moeda_codigo: moedaCodigo,
        moeda_simbolo: moedaSimbolo,
      })
      .select("id")
      .single<{ id: string }>();

    if (accountError || !createdAccount) {
      redirect(`/admin?message=${encodeURIComponent(accountError?.message ?? "Nao foi possivel criar a conta MT5.")}&type=error`);
    }

    accountId = createdAccount.id;
  }

  const { data: existingLicense } = await adminClient
    .from("licencas")
    .select("id")
    .eq("conta_trading_id", accountId)
    .maybeSingle<{ id: string }>();

  if (existingLicense?.id) {
    await adminClient
      .from("licencas")
      .update({
        nome_plano: nomePlano,
        status,
        valor,
        data_expiracao: dataExpiracao,
      })
      .eq("id", existingLicense.id);
  } else {
    await adminClient.from("licencas").insert({
      user_id: userId,
      conta_trading_id: accountId,
      nome_plano: nomePlano,
      status,
      valor,
      data_expiracao: dataExpiracao,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Licenca+salva+com+sucesso.&type=success");
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
  const status = textValue(formData, "status");

  await adminClient.from("licencas").update({ status }).eq("id", licenseId);

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  redirect("/admin?message=Status+da+licenca+atualizado.&type=success");
}
