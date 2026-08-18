"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";
import { claimLegacyDataForSoleUser } from "@/lib/user-scope";

function destination(formData: FormData): string {
  const value = String(formData.get("next") ?? "/");
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export async function login(formData: FormData) {
  const next = destination(formData);
  const client = await createAuthClient();
  const { data, error } = await client.auth.signInWithPassword(credentials(formData));
  if (error || !data.user) redirect(`/login?e=invalid&next=${encodeURIComponent(next)}`);
  await claimLegacyDataForSoleUser(data.user.id);
  redirect(next);
}

export async function signup(formData: FormData) {
  const next = destination(formData);
  const values = credentials(formData);
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const client = await createAuthClient();
  const { data, error } = await client.auth.signUp({
    ...values,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(`/login?e=signup&next=${encodeURIComponent(next)}`);
  if (data.session && data.user) {
    await claimLegacyDataForSoleUser(data.user.id);
    redirect(next);
  }
  redirect(`/login?message=check-email&next=${encodeURIComponent(next)}`);
}
