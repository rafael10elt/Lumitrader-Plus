import { NextResponse } from "next/server";
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

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("contas_trading")
    .select(`
      id,
      numero_conta,
      mt5_server,
      mt5_password,
      ativo,
      usuarios!inner(id, acesso_ativo),
      licencas!inner(status, data_expiracao),
      configuracoes_sessao!inner(id, ativo, timeframe, modo, sistema_ligado, breakeven_ativo, trailing_stop_ativo, meta_lucro_diaria, perda_maxima_diaria, limite_operacoes_ativo, limite_operacoes_diaria)
    `)
    .eq("usuarios.acesso_ativo", true)
    .eq("licencas.status", "ativa")
    .eq("configuracoes_sessao.sistema_ligado", true)
    .gte("licencas.data_expiracao", new Date().toISOString().slice(0, 10));

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const accounts = (data ?? [])
    .filter((item) => item.mt5_server && item.mt5_password)
    .map((item) => ({
      id: item.id,
      number: item.numero_conta,
      server: item.mt5_server,
      password: item.mt5_password,
      config: Array.isArray(item.configuracoes_sessao) ? item.configuracoes_sessao[0] : item.configuracoes_sessao,
    }));

  return NextResponse.json({ ok: true, accounts });
}
