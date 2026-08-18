import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { completeYahooAuthorization, YAHOO_OAUTH_STATE_COOKIE } from "@/lib/yahoo-oauth";

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state") ?? "";
  const expectedState = request.cookies.get(YAHOO_OAUTH_STATE_COOKIE)?.value ?? "";
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const providerError = request.nextUrl.searchParams.get("error");
  let outcome = "yahoo-error";
  if (providerError) outcome = "yahoo-cancelled";
  else if (!state || !expectedState || !safeEqual(state, expectedState)) outcome = "yahoo-invalid-state";
  else if (!code) outcome = "yahoo-missing-code";
  else {
    try {
      await completeYahooAuthorization(code);
      outcome = "yahoo-connected";
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
  return response;
}
