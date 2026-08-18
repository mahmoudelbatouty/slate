import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  buildYahooAuthorizationUrl,
  getYahooOAuthConfig,
  yahooCodeChallenge,
  yahooOAuthConfigured,
  YAHOO_OAUTH_STATE_COOKIE,
  YAHOO_OAUTH_VERIFIER_COOKIE,
} from "@/lib/yahoo-oauth";

export async function GET(request: Request) {
  if (!yahooOAuthConfigured()) return NextResponse.redirect(new URL("/?connection=yahoo-setup-needed", request.url));
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const response = NextResponse.redirect(
    buildYahooAuthorizationUrl(getYahooOAuthConfig(), state, yahooCodeChallenge(verifier))
  );
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/yahoo",
    maxAge: 60 * 10,
  } as const;
  response.cookies.set(YAHOO_OAUTH_STATE_COOKIE, state, cookieOptions);
  response.cookies.set(YAHOO_OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
  return response;
}
