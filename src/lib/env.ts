const requiredPublicEnvVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
} as const;

export function hasSupabaseEnv() {
  return Object.values(requiredPublicEnvVars).every(Boolean);
}

export function getSupabaseEnv() {
  const missing = Object.entries(requiredPublicEnvVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    url: requiredPublicEnvVars.NEXT_PUBLIC_SUPABASE_URL as string,
    anonKey: requiredPublicEnvVars.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function getRequiredServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getServiceRoleKey() {
  return getRequiredServerEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function hasOpenAiApiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAiApiKey() {
  return getRequiredServerEnv("OPENAI_API_KEY");
}

export function getN8nReportWebhookUrl() {
  return getRequiredServerEnv("N8N_REPORT_WEBHOOK_URL");
}

export function getIngestToken() {
  return getRequiredServerEnv("LUMITRADER_INGEST_TOKEN");
}
