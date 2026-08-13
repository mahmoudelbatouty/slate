import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, parseTokenEncryptionKey } from "./token-crypto";

describe("provider token encryption", () => {
  it("round-trips without storing plaintext", () => {
    const key = randomBytes(32);
    const token = "refresh-token-private-value";
    const sealed = encryptToken(token, key);
    expect(sealed).not.toContain(token);
    expect(decryptToken(sealed, key)).toBe(token);
  });

  it("rejects the wrong key", () => {
    const sealed = encryptToken("secret", randomBytes(32));
    expect(() => decryptToken(sealed, randomBytes(32))).toThrow();
  });

  it("requires exactly 32 bytes of key material", () => {
    expect(parseTokenEncryptionKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => parseTokenEncryptionKey(randomBytes(16).toString("base64"))).toThrow();
  });
});
