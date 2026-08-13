import "server-only";

import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;

export function createConnectorToken(): string {
  return `slate_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

export function createPairingSecret(): string {
  return `slate_pair_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function hashConnectorToken(token: string): string {
  return hashSecret(token);
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice("Bearer ".length).trim();
  return token.startsWith("slate_") ? token : null;
}
