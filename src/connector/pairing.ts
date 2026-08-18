import { z } from "zod";

export const connectorPlatform = z.enum(["sleeper", "espn"]);

export const pairingRequest = z.object({
  platform: connectorPlatform,
}).strict();

export const pairingClaimRequest = z.object({
  challengeId: z.uuid(),
  claimSecret: z.string().startsWith("slate_pair_").max(128),
  platform: connectorPlatform,
  dashboardOrigin: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "Dashboard origin must use HTTP or HTTPS"),
}).strict();

export type ConnectorPlatform = z.infer<typeof connectorPlatform>;

export const PAIRING_TTL_MS = 5 * 60 * 1_000;
