import { getN8nReportWebhookUrl } from "@/lib/env";
import type { ReportPayload } from "@/lib/backend/types";

export async function sendReportToN8n(report: ReportPayload) {
  const response = await fetch(getN8nReportWebhookUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(report),
  });

  if (!response.ok) {
    throw new Error(`n8n webhook error: ${response.status}`);
  }
}
