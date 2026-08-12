/**
 * Single-user password gate. Not a user system — there is exactly one
 * secret (APP_PASSWORD) and one cookie.
 *
 * The cookie stores a SHA-256 of the password rather than the password
 * itself, so a leaked cookie jar doesn't hand over the plaintext. Uses
 * Web Crypto so it runs unchanged in middleware (edge runtime).
 */

export const AUTH_COOKIE = "slate_auth";

export async function tokenFor(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`slate:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare so the cookie can't be guessed a byte at a time. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password || !token) return false;
  return safeEqual(token, await tokenFor(password));
}
