import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/safe-equal";
import { db } from "@/db/admin";
import { runSync } from "@/sync/run";
import {
  completeYahooAuthorization,
  YAHOO_OAUTH_STATE_COOKIE,
  YAHOO_OAUTH_VERIFIER_COOKIE,
} from "@/lib/yahoo-oauth";
import { currentUser } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const user = await currentUser();
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expectedState = request.cookies.get(YAHOO_OAUTH_STATE_COOKIE)?.value ?? "";
  const codeVerifier = request.cookies.get(YAHOO_OAUTH_VERIFIER_COOKIE)?.value ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const providerError = request.nextUrl.searchParams.get("error");
  let outcome = "yahoo-error";
  if (providerError) outcome = "yahoo-cancelled";
  else if (!state || !expectedState || !safeEqual(state, expectedState)) outcome = "yahoo-invalid-state";
  else if (!code || !codeVerifier) outcome = "yahoo-missing-code";
  else if (!user) outcome = "yahoo-error";
  else {
    try {
      await completeYahooAuthorization(code, codeVerifier, user.id);
      const configuredSeason = Number(process.env.DEFAULT_SEASON);
      const season = Number.isInteger(configuredSeason) && configuredSeason > 2000
        ? configuredSeason
        : new Date().getFullYear();
      const [sync] = await runSync(db(), "daily", season, ["yahoo"], user.id);
      outcome = sync?.status === "ok" ? "yahoo-connected" : "yahoo-sync-pending";
    } catch {
      // OAuth codes and token responses are deliberately never logged.
    }
  }
  const response = NextResponse.redirect(new URL(`/?connection=${outcome}`, request.url));
  response.cookies.set(YAHOO_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/yahoo",
    maxAge: 0,
  });
  response.cookies.set(YAHOO_OAUTH_VERIFIER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/yahoo",
    maxAge: 0,
  });
  return response;
}
