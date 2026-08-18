import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/admin", () => ({ db: vi.fn() }));

import {
  buildYahooAuthorizationUrl,
  refreshYahooAccessToken,
  yahooCodeChallenge,
  type YahooOAuthConfig,
} from "./yahoo-oauth";

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("Yahoo OAuth", () => {
  it("builds an authorization request with state and S256 PKCE", () => {
    const config: YahooOAuthConfig = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "https://slate.example/api/auth/yahoo/callback",
      encryptionKey: Buffer.alloc(32),
    };
    const verifier = "a".repeat(64);
    const url = buildYahooAuthorizationUrl(config, "state-value", yahooCodeChallenge(verifier));

    expect(url.origin + url.pathname).toBe("https://api.login.yahoo.com/oauth2/request_auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(yahooCodeChallenge(verifier));
    expect(url.toString()).not.toContain(verifier);
  });

  it("uses a rotated refresh token and keeps the old one when Yahoo omits it", async () => {
    process.env.YAHOO_CLIENT_ID = "client-id";
    process.env.YAHOO_CLIENT_SECRET = "client-secret";
    process.env.YAHOO_REDIRECT_URI = "https://slate.example/api/auth/yahoo/callback";
    process.env.PLATFORM_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const responses = [
      { access_token: "access-1", refresh_token: "refresh-2", expires_in: 3600 },
      { access_token: "access-2", expires_in: 3600 },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(refreshYahooAccessToken("refresh-1")).resolves.toMatchObject({
      accessToken: "access-1",
      refreshToken: "refresh-2",
    });
    await expect(refreshYahooAccessToken("refresh-2")).resolves.toMatchObject({
      accessToken: "access-2",
      refreshToken: "refresh-2",
    });
  });
});
