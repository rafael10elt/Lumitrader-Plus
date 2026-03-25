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

export function getServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }

  return serviceRoleKey;
}
