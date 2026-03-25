import type { ReportPayload } from "@/lib/backend/types";

function escapeCsv(value: string | number | null | undefined) {
  const normalized = value == null ? "" : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function toCsv(report: Omit<ReportPayload, "formats">) {
  const rows = [
    ["event", report.event],
    ["generatedAt", report.generatedAt],
    ["user", report.user.nome ?? report.user.email ?? ""],
    ["telegram_id", report.user.telegram_id ?? ""],
    ["account_number", report.account.number],
    ["license_plan", report.account.active_license.plan],
    ["symbol", report.operation.symbol],
    ["side", report.operation.side],
    ["lot", report.operation.lot],
    ["entry_price", report.operation.entry_price],
    ["exit_price", report.operation.exit_price ?? ""],
    ["profit_loss", report.operation.profit_loss ?? ""],
    ["risk_amount", report.risk.riskAmount],
    ["reward_amount", report.risk.rewardAmount ?? ""],
    ["risk_reward_ratio", report.risk.riskRewardRatio ?? ""],
    ["ai_summary", report.ai.summary],
  ];

  return rows.map((row) => row.map((value) => escapeCsv(value)).join(",")).join("\n");
}

export function toHtml(report: Omit<ReportPayload, "formats">) {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; background:#081221; color:#f8fafc; padding:24px;">
        <h1>Lumitrader Report</h1>
        <p><strong>Evento:</strong> ${report.event}</p>
        <p><strong>Cliente:</strong> ${report.user.nome ?? report.user.email ?? "-"}</p>
        <p><strong>Conta MT5:</strong> ${report.account.number}</p>
        <p><strong>Ativo:</strong> ${report.operation.symbol}</p>
        <p><strong>Lado:</strong> ${report.operation.side}</p>
        <p><strong>Lote:</strong> ${report.operation.lot}</p>
        <p><strong>Entrada:</strong> ${report.operation.entry_price}</p>
        <p><strong>Saida:</strong> ${report.operation.exit_price ?? "-"}</p>
        <p><strong>P/L:</strong> ${report.operation.profit_loss ?? "-"}</p>
        <p><strong>Resumo IA:</strong></p>
        <pre style="white-space:pre-wrap;background:#0f172a;padding:16px;border-radius:12px;">${report.ai.summary}</pre>
      </body>
    </html>
  `.trim();
}
