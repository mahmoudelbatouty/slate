import { describe, expect, it } from "vitest";
import { pairingClaimRequest, pairingRequest, PAIRING_TTL_MS } from "./pairing";

describe("connector pairing protocol", () => {
  it("accepts only an allowlisted provider", () => {
    expect(pairingRequest.parse({ platform: "sleeper" })).toEqual({ platform: "sleeper" });
    expect(() => pairingRequest.parse({ platform: "espn" })).toThrow();
    expect(() => pairingRequest.parse({ platform: "sleeper", token: "nope" })).toThrow();
  });

  it("validates a narrow claim envelope", () => {
    const claim = {
      challengeId: "019ff861-4be7-70d1-ae2d-69641ab43d48",
      claimSecret: `slate_pair_${"a".repeat(43)}`,
      platform: "sleeper",
      dashboardOrigin: "http://localhost:3000",
    } as const;

    expect(pairingClaimRequest.parse(claim)).toEqual(claim);
    expect(() => pairingClaimRequest.parse({ ...claim, dashboardOrigin: "chrome://settings" })).toThrow();
    expect(() => pairingClaimRequest.parse({ ...claim, cookie: "forbidden" })).toThrow();
  });

  it("caps challenges at five minutes", () => {
    expect(PAIRING_TTL_MS).toBe(300_000);
  });
});
