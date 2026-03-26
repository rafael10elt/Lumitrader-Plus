"use server";

import { revalidatePath } from "next/cache";
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
  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

async function upsertConfig(profileId: string, contaTradingId: string, configId: string, payload: Record<string, unknown>) {
  const adminClient = createAdminClient();

  const { data: latestConfig } = await adminClient
    .from("configuracoes_sessao")
    .select("id")
    .eq("conta_trading_id", contaTradingId)
    .order("atualizado_em", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  const targetConfigId = latestConfig?.id ?? configId;
  if (targetConfigId) {
    await adminClient.from("configuracoes_sessao").update(payload).eq("id", targetConfigId);
    return;
  }

  await adminClient.from("configuracoes_sessao").insert({
    user_id: profileId,
    conta_trading_id: contaTradingId,
    ...payload,
  });
}

export async function saveTradingSettings(formData: FormData) {
  const { profile } = await requireAuthenticatedUser();

  const configId = textValue(formData, "config_id");
  const contaTradingId = textValue(formData, "conta_trading_id");
  const ativo = textValue(formData, "ativo") || profile.ativo_padrao;
  const timeframe = textValue(formData, "timeframe") || profile.timeframe_padrao;
  const modo = textValue(formData, "modo") || "conservador";
  const horarioInicio = textValue(formData, "horario_inicio") || "09:00";
  const horarioFim = textValue(formData, "horario_fim") || "17:00";
  const metaLucro = numberValue(formData, "meta_lucro_diaria") ?? 0;
  const perdaMaxima = numberValue(formData, "perda_maxima_diaria") ?? 0;
  const sistemaLigado = textValue(formData, "current_system_state") === "true";
  const breakevenAtivo = textValue(formData, "breakeven_ativo") === "on";
  const trailingAtivo = textValue(formData, "trailing_stop_ativo") === "on";
  const limiteOperacoesAtivo = textValue(formData, "limite_operacoes_ativo") === "on";
  const limiteOperacoes = limiteOperacoesAtivo ? numberValue(formData, "limite_operacoes_diaria") : null;

  await upsertConfig(profile.id, contaTradingId, configId, {
    ativo,
    timeframe,
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
  });

  revalidatePath("/dashboard");
  return;
}

export async function toggleSystemState(formData: FormData) {
  const { profile } = await requireAuthenticatedUser();

  const configId = textValue(formData, "config_id");
  const contaTradingId = textValue(formData, "conta_trading_id");
  const currentState = textValue(formData, "current_state") === "true";
  const ativo = textValue(formData, "ativo") || profile.ativo_padrao;
  const timeframe = textValue(formData, "timeframe") || profile.timeframe_padrao;

  await upsertConfig(profile.id, contaTradingId, configId, {
    ativo,
    timeframe,
    sistema_ligado: !currentState,
  });

  revalidatePath("/dashboard");
  return;
}

async function submitTradeCommandWithAction(
  action: "buy" | "sell" | "close" | "partial",
  formData: FormData,
) {
  const { profile } = await requireAuthenticatedUser();
  const adminClient = createAdminClient();

  const contaTradingId = textValue(formData, "conta_trading_id");
  const ativo = textValue(formData, "ativo") || profile.ativo_padrao;
  const timeframe = textValue(formData, "timeframe") || profile.timeframe_padrao;
  const lote = numberValue(formData, "lote");
  const stopLoss = numberValue(formData, "stop_loss");
  const takeProfit = numberValue(formData, "take_profit");
  const ticketReferencia = textValue(formData, "ticket_referencia");

  const isPartialClose = action === "partial";
  const tipo =
    action === "buy"
      ? "open_buy"
      : action === "sell"
        ? "open_sell"
        : isPartialClose
          ? "partial_close_position"
          : "close_position";

  if (!contaTradingId || !tipo) {
    return;
  }

  if ((tipo === "close_position" || tipo === "partial_close_position") && !ticketReferencia) {
    throw new Error("Nao foi possivel identificar o ticket da posicao aberta. Aguarde a sincronizacao do painel e tente novamente.");
  }

  const payload = {
    origem: "dashboard_manual",
    action: isPartialClose ? "partial_close" : tipo,
    closeFraction: isPartialClose ? 0.5 : undefined,
  };

  const { error } = await adminClient.from("comandos_trading").insert({
    user_id: profile.id,
    conta_trading_id: contaTradingId,
    ativo,
    timeframe,
    tipo,
    lote: tipo === "open_buy" || tipo === "open_sell" ? lote : null,
    stop_loss: tipo === "open_buy" || tipo === "open_sell" ? stopLoss : null,
    take_profit: tipo === "open_buy" || tipo === "open_sell" ? takeProfit : null,
    ticket_referencia: ticketReferencia || null,
    payload,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  return;
}

export async function submitBuyCommand(formData: FormData) {
  return submitTradeCommandWithAction("buy", formData);
}

export async function submitSellCommand(formData: FormData) {
  return submitTradeCommandWithAction("sell", formData);
}

export async function submitCloseCommand(formData: FormData) {
  return submitTradeCommandWithAction("close", formData);
}

export async function submitPartialCloseCommand(formData: FormData) {
  return submitTradeCommandWithAction("partial", formData);
}

export async function submitTradeCommand(formData: FormData) {
  const action = textValue(formData, "trade_action");
  const normalizedAction = action === "sell" ? "sell" : action === "close" ? "close" : "buy";
  return submitTradeCommandWithAction(normalizedAction, formData);
}




