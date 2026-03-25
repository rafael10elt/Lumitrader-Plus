import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  nome: string | null;
  email: string | null;
  role: "admin" | "user";
  acesso_ativo: boolean;
  ativo_padrao: string;
  timeframe_padrao: string;
};

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("usuarios")
    .select("id, nome, email, role, acesso_ativo, ativo_padrao, timeframe_padrao")
    .eq("id", user.id)
    .maybeSingle<AppUser>();

  const resolvedProfile: AppUser =
    profile ?? {
      id: user.id,
      nome: (user.user_metadata.nome as string | undefined) ?? null,
      email: user.email ?? null,
      role: "user",
      acesso_ativo: true,
      ativo_padrao: "XAUUSD",
      timeframe_padrao: "M5",
    };

  return { supabase, authUser: user, profile: resolvedProfile };
}

export async function requireAdminUser() {
  const context = await requireAuthenticatedUser();

  if (context.profile.role !== "admin") {
    redirect("/dashboard");
  }

  return context;
}
