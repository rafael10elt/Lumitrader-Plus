import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getIngestToken } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");

  if (!bearer || bearer !== getIngestToken()) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const accountNumber = url.searchParams.get("account");
  const adminClient = createAdminClient();

  let query = adminClient
    .from("comandos_trading")
    .select(`
      id,
      ativo,
      timeframe,
      tipo,
      lote,
      stop_loss,
      take_profit,
      ticket_referencia,
      payload,
      conta_trading:conta_trading_id!inner(id, numero_conta)
    `)
    .eq("status", "pending")
    .order("solicitado_em", { ascending: true })
    .limit(20);

  if (accountNumber) {
    query = query.eq("conta_trading.numero_conta", accountNumber);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const commandIds = rows.map((item) => item.id);

  if (commandIds.length > 0) {
    const { error: updateError } = await adminClient
      .from("comandos_trading")
      .update({
        status: "processing",
        processado_em: new Date().toISOString(),
      })
      .in("id", commandIds)
      .eq("status", "pending");

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
  }

  const commands = rows.map((item) => {
    const tradingAccount = item.conta_trading as { numero_conta?: string } | Array<{ numero_conta?: string }> | null;

    return {
    id: item.id,
    accountNumber: Array.isArray(tradingAccount) ? tradingAccount[0]?.numero_conta : tradingAccount?.numero_conta,
    symbol: item.ativo,
    timeframe: item.timeframe,
    type: item.tipo,
    lot: item.lote != null ? Number(item.lote) : null,
    stopLoss: item.stop_loss != null ? Number(item.stop_loss) : null,
    takeProfit: item.take_profit != null ? Number(item.take_profit) : null,
    referenceTicket: item.ticket_referencia,
    payload: item.payload ?? {},
    };
  });

  return NextResponse.json({ ok: true, commands });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");

  if (!bearer || bearer !== getIngestToken()) {
    return unauthorized();
  }

  const body = await request.json();
  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("comandos_trading")
    .update({
      status: body.status,
      resultado: body.result ?? null,
      erro: body.error ?? null,
      processado_em: new Date().toISOString(),
    })
    .eq("id", body.commandId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
