import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types.gen";

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

/**
 * Service-role client. Server only — never import this from a component
 * that ships to the browser.
 *
 * v1 is single-user with no RLS (see schema.sql), so the service role is
 * the only key that exists. The password gate in middleware.ts is what
 * stands between the internet and this client.
 */
export function db(): Db {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }

  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** True when the env is wired. Lets pages render an empty state instead of throwing. */
export function dbConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
