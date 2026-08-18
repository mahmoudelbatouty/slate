import { z } from "zod";
import { db } from "@/db/admin";
import { createHash } from "node:crypto";
import { decryptToken, encryptToken, parseTokenEncryptionKey } from "./token-crypto";

export const YAHOO_AUTHORIZATION_ENDPOINT = "https://api.login.yahoo.com/oauth2/request_auth";
export const YAHOO_OAUTH_STATE_COOKIE = "slate_yahoo_oauth_state";
export const YAHOO_OAUTH_VERIFIER_COOKIE = "slate_yahoo_oauth_verifier";
const YAHOO_TOKEN_ENDPOINT = "https://api.login.yahoo.com/oauth2/get_token";
const YAHOO_FANTASY_HEALTH_ENDPOINT = "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login/games;game_keys=nfl?format=json";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.coerce.number().int().positive(),
  xoauth_yahoo_guid: z.string().min(1).optional(),
});

export interface YahooOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  encryptionKey: Buffer;
}

export function yahooOAuthConfigured(): boolean {
  return Boolean(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET && process.env.YAHOO_REDIRECT_URI && process.env.PLATFORM_TOKEN_ENCRYPTION_KEY);
}

export function getYahooOAuthConfig(): YahooOAuthConfig {
  const clientId = process.env.YAHOO_CLIENT_ID;
  const clientSecret = process.env.YAHOO_CLIENT_SECRET;
  const redirectUri = process.env.YAHOO_REDIRECT_URI;
  const encodedKey = process.env.PLATFORM_TOKEN_ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !redirectUri || !encodedKey) throw new Error("Yahoo OAuth is not configured.");
  return { clientId, clientSecret, redirectUri, encryptionKey: parseTokenEncryptionKey(encodedKey) };
}

export function yahooCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function buildYahooAuthorizationUrl(
  config: YahooOAuthConfig,
  state: string,
  codeChallenge: string
): URL {
  const url = new URL(YAHOO_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function completeYahooAuthorization(code: string, codeVerifier: string): Promise<void> {
  const config = getYahooOAuthConfig();
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
  const response = await fetch(YAHOO_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code,
      code_verifier: codeVerifier,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Yahoo token exchange failed with status ${response.status}.`);
  const tokens = tokenResponseSchema.parse(await response.json());
  if (!tokens.refresh_token) throw new Error("Yahoo token exchange did not return a refresh token.");
  await verifyYahooFantasyAccess(tokens.access_token);
  const encryptedRefreshToken = encryptToken(tokens.refresh_token, config.encryptionKey);
  const { error } = await db().from("platform_accounts").upsert({
    platform: "yahoo",
    external_user_id: tokens.xoauth_yahoo_guid ?? null,
    username: null,
    secrets: { version: 1, refresh_token_enc: encryptedRefreshToken },
    expires_at: new Date(Date.now() + tokens.expires_in * 1_000).toISOString(),
    last_ok_at: new Date().toISOString(),
  }, { onConflict: "platform" });
  if (error) throw new Error(`Yahoo account save failed: ${error.message}`);
}

export async function refreshYahooAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const config = getYahooOAuthConfig();
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");
  const response = await fetch(YAHOO_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Yahoo token refresh failed with status ${response.status}.`);
  const tokens = tokenResponseSchema.parse(await response.json());
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? refreshToken,
    expiresIn: tokens.expires_in,
  };
}

export function decryptYahooRefreshToken(sealed: string): string {
  return decryptToken(sealed, getYahooOAuthConfig().encryptionKey);
}

export function encryptYahooRefreshToken(refreshToken: string): string {
  return encryptToken(refreshToken, getYahooOAuthConfig().encryptionKey);
}

async function verifyYahooFantasyAccess(accessToken: string): Promise<void> {
  const response = await fetch(YAHOO_FANTASY_HEALTH_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Yahoo Fantasy permission check failed with status ${response.status}.`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("fantasy_content" in payload)) throw new Error("Yahoo Fantasy returned an unexpected response.");
}
