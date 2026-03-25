import OpenAI from "openai";
import { getOpenAiApiKey } from "@/lib/env";
import type { ReportPayload } from "@/lib/backend/types";

const model = "gpt-5";

function buildPrompt(report: Omit<ReportPayload, "ai" | "formats">) {
  return [
    "Voce e o analista do Lumitrader.",
    "Resuma a operacao em portugues do Brasil, com foco objetivo e operacional.",
    "Inclua contexto de risco, situacao da conta e um comentario util para Telegram.",
    "Se o evento for de abertura, destaque o setup e o risco.",
    "Se o evento for de fechamento, destaque resultado, risco-retorno e disciplina operacional.",
    "Responda em no maximo 5 linhas curtas.",
    JSON.stringify(report),
  ].join("\n");
}

export async function generateAiSummary(report: Omit<ReportPayload, "ai" | "formats">) {
  const client = new OpenAI({ apiKey: getOpenAiApiKey() });
  const response = await client.responses.create({
    model,
    input: buildPrompt(report),
  });

  return {
    summary: response.output_text.trim(),
    request_id: response._request_id ?? null,
    model,
  };
}
