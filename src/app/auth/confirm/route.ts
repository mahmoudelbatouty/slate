import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { claimLegacyDataForSoleUser } from "@/lib/user-scope";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const requested = url.searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
  const client = await createAuthClient();

  const result = tokenHash && type
    ? await client.auth.verifyOtp({ token_hash: tokenHash, type })
    : code
      ? await client.auth.exchangeCodeForSession(code)
      : { data: { user: null }, error: new Error("Missing confirmation token") };

  if (result.error || !result.data.user) {
    return NextResponse.redirect(new URL("/login?e=confirmation", url.origin));
  }
  await claimLegacyDataForSoleUser(result.data.user.id);
  return NextResponse.redirect(new URL(next, url.origin));
}
