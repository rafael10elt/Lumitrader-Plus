"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getBaseUrl(headerList: Headers) {
  const forwardedHost = headerList.get("x-forwarded-host");
  const host = forwardedHost ?? headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") ?? "http";

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  if (!host) {
    return "http://localhost:3000";
  }

  return `${protocol}://${host}`;
}

function toText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = toText(formData.get("email"));
  const password = toText(formData.get("password"));

  if (!email || !password) {
    redirect("/login?message=Informe+email+e+senha.&type=error");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}&type=error`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();
  const headerList = await headers();

  const name = toText(formData.get("name"));
  const email = toText(formData.get("email"));
  const password = toText(formData.get("password"));

  if (!name || !email || !password) {
    redirect("/login?message=Preencha+nome%2C+email+e+senha.&type=error");
  }

  const redirectTo = `${getBaseUrl(headerList)}/auth/confirm`;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        nome: name,
      },
    },
  });

  if (error) {
    redirect(`/login?message=${encodeURIComponent(error.message)}&type=error`);
  }

  revalidatePath("/", "layout");
  redirect("/login?message=Conta+criada.+Confirme+seu+email+para+entrar.&type=success");
}

export async function signout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/login?message=Sessao+encerrada.&type=success");
}
