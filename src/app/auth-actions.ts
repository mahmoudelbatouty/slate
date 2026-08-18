"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/supabase/server";

export async function logout() {
  const client = await createAuthClient();
  await client.auth.signOut();
  redirect("/login?message=signed-out");
}
