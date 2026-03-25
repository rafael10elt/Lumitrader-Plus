import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { getIngestToken } from "@/lib/env";
import { processTradingEvent } from "@/lib/backend/reporting";
import type { TradingEventPayload } from "@/lib/backend/types";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.replace(/^Bearer\s+/i, "");

  if (!bearer || bearer !== getIngestToken()) {
    return unauthorized();
  }

  try {
    const payload = (await request.json()) as TradingEventPayload;

    if (!payload?.event || !payload?.account?.number) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    if (payload.event !== "account_sync" && !payload?.operation?.symbol) {
      return NextResponse.json({ ok: false, error: "Operation payload required" }, { status: 400 });
    }

    const report = await processTradingEvent(payload);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
