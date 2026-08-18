"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";

export type PasswordState = { status: "idle" } | { status: "error"; message: string };

export async function updatePassword(
  _previous: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { status: "error", message: "Password must be at least 8 characters." };
  if (password !== confirm) return { status: "error", message: "The two passwords do not match." };

  let client: Awaited<ReturnType<typeof createAuthClient>>;
  try {
    client = await createAuthClient();
  } catch {
    return { status: "error", message: "Supabase Auth is not configured on the server." };
  }

  // The recovery link established a real session; without one there is nothing
  // to update and the user must request a fresh link.
  const { data } = await client.auth.getUser();
  if (!data.user) {
    return {
      status: "error",
      message: "This reset link has expired. Request a new one from the sign-in screen.",
    };
  }

  const { error } = await client.auth.updateUser({ password });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "same_password"
          ? "That is already your current password. Choose a different one."
          : "The password could not be updated. Try a different one.",
    };
  }
  redirect("/");
}
