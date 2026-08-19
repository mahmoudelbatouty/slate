import { describe, expect, it } from "vitest";
import { preferProjection } from "./projection";

const SYNCED = "2026-08-19T01:09:04.541+00:00";
const BEFORE = "2026-08-18T16:36:38.598+00:00";
const AFTER = "2026-08-19T02:00:00.000+00:00";

describe("preferProjection", () => {
  it("uses the computed value when there is no capture", () => {
    expect(preferProjection(undefined, 172.25, SYNCED)).toBe(172.25);
  });

  it("prefers a capture taken after the last provider sync", () => {
    expect(preferProjection({ points: 140.02, capturedAt: AFTER }, 172.25, SYNCED)).toBe(140.02);
  });

  it("drops a capture that predates the last provider sync", () => {
    // The real failure: the lineup changed after the capture, so the stale
    // provider figure was 32 points below the lineup on screen.
    expect(preferProjection({ points: 140.02, capturedAt: BEFORE }, 172.25, SYNCED)).toBe(172.25);
  });

  it("keeps a stale capture when Slate computed nothing", () => {
    expect(preferProjection({ points: 140.02, capturedAt: BEFORE }, null, SYNCED)).toBe(140.02);
  });

  it("falls back to the capture when either timestamp is missing or unparseable", () => {
    expect(preferProjection({ points: 140.02, capturedAt: null }, 172.25, SYNCED)).toBe(140.02);
    expect(preferProjection({ points: 140.02, capturedAt: BEFORE }, 172.25, null)).toBe(140.02);
    expect(preferProjection({ points: 140.02, capturedAt: "whenever" }, 172.25, SYNCED)).toBe(140.02);
  });

  it("treats a null capture value as no capture at all", () => {
    expect(preferProjection({ points: null, capturedAt: AFTER }, 172.25, SYNCED)).toBe(172.25);
  });
});
