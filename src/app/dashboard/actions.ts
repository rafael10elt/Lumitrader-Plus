"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string) {
  const raw = textValue(formData, key);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function saveTradingSettings(formData: FormData) {
  const { profile } = await requireAuthenticatedUser();
  const adminClient = createAdminClient();

  const configId = textValue(formData, "config_id");
  const contaTradingId = textValue(formData, "conta_trading_id");
  const ativo = textValue(formData, "ativo") || profile.ativo_padrao;
  const modo = textValue(formData, "modo") || "conservador";
  const horarioInicio = textValue(formData, "horario_inicio") || "09:00";
  const horarioFim = textValue(formData, "horario_fim") || "17:00";
  const metaLucro = numberValue(formData, "meta_lucro_diaria") ?? 0;
  const perdaMaxima = numberValue(formData, "perda_maxima_diaria") ?? 0;
  const sistemaLigado = textValue(formData, "sistema_ligado") === "on";
  const breakevenAtivo = textValue(formData, "breakeven_ativo") === "on";
  const trailingAtivo = textValue(formData, "trailing_stop_ativo") === "on";
  const limiteOperacoesAtivo = textValue(formData, "limite_operacoes_ativo") === "on";
  const limiteOperacoes = limiteOperacoesAtivo ? numberValue(formData, "limite_operacoes_diaria") : null;

  const payload = {
    user_id: profile.id,
    conta_trading_id: contaTradingId,
    ativo,
    sistema_ligado: sistemaLigado,
    modo,
    breakeven_ativo: breakevenAtivo,
    trailing_stop_ativo: trailingAtivo,
    horario_inicio: `${horarioInicio}:00`,
    horario_fim: `${horarioFim}:00`,
    meta_lucro_diaria: metaLucro,
    perda_maxima_diaria: perdaMaxima,
    limite_operacoes_ativo: limiteOperacoesAtivo,
    limite_operacoes_diaria: limiteOperacoes,
  };

  if (configId) {
    await adminClient.from("configuracoes_sessao").update(payload).eq("id", configId);
  } else {
    await adminClient.from("configuracoes_sessao").insert(payload);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard?account=${contaTradingId}`);
}
