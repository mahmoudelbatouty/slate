"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseAuthSubmission } from "@/lib/auth-form";
import { createAuthClient } from "@/lib/supabase/server";

/**
 * One action serves the whole screen. The submitting button names the intent so
 * the form keeps a single `useActionState` reducer and one pending flag.
 */
export type AuthState =
  | { status: "idle" }
  | { status: "error"; message: string; unconfirmed?: boolean; email?: string }
  | { status: "check-email"; email: string }
  | { status: "resent"; email: string }
  | { status: "reset-sent"; email: string };

async function confirmRedirect(next: string): Promise<string> {
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  return `${origin}/auth/confirm?next=${encodeURIComponent(next)}`;
}

export async function submitAuth(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = parseAuthSubmission(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message, email: parsed.email };

  const { intent, email, password, next } = parsed.value;

  let client: Awaited<ReturnType<typeof createAuthClient>>;
  try {
    client = await createAuthClient();
  } catch {
    return { status: "error", message: "Supabase Auth is not configured on the server.", email };
  }

  if (intent === "reset") {
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: await confirmRedirect("/account/password"),
    });
    // Never reveal whether an account exists: an unknown email reports the same
    // outcome as a real one.
    if (error && error.code !== "user_not_found") {
      return {
        status: "error",
        message: "That reset email could not be sent. Wait a minute and retry.",
        email,
      };
    }
    return { status: "reset-sent", email };
  }

  if (intent === "resend") {
    const { error } = await client.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: await confirmRedirect(next) },
    });
    if (error) {
      return {
        status: "error",
        message: "That confirmation email could not be sent again. Wait a minute and retry.",
        email,
      };
    }
    return { status: "resent", email };
  }

  if (intent === "signup") {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: await confirmRedirect(next) },
    });
    if (error) {
      return {
        status: "error",
        message:
          error.code === "user_already_exists" || error.code === "email_exists"
            ? "An account already uses that email. Sign in instead."
            : "The account could not be created. Try another email or a longer password.",
        email,
      };
    }
    // Supabase returns a session here only when email confirmation is switched off.
    if (data.session && data.user) redirect(next);
    return { status: "check-email", email };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error?.code === "email_not_confirmed") {
    return {
      status: "error",
      message: "This account still needs email confirmation.",
      unconfirmed: true,
      email,
    };
  }
  if (error || !data.user) {
    return { status: "error", message: "Email or password is incorrect.", email };
  }
  redirect(next);
}
