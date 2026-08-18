import { describe, expect, it } from "vitest";
import {
  ACCOUNT_SYNC_MIN_GAP_MS,
  hasRecentAccountSync,
  hasRecentScoreSync,
  isAccountRun,
  isLiveSyncWindow,
  isScoreRun,
  LIVE_SYNC_MIN_GAP_MS,
  platformsNeedingScoreSync,
  platformsNeedingAccountSync,
} from "./live-refresh";

const NOW = Date.parse("2026-09-13T17:00:00Z");

describe("isLiveSyncWindow", () => {
  it("opens shortly before a scheduled kickoff", () => {
    expect(
      isLiveSyncWindow([
        {
          start_time: "2026-09-13T17:10:00Z",
          is_over: false,
          in_progress: false,
          canceled: false,
        },
      ], NOW)
    ).toBe(true);
  });

  it("stays open when Sleeper marks a game in progress", () => {
    expect(
      isLiveSyncWindow([
        {
          start_time: null,
          is_over: false,
          in_progress: true,
          canceled: false,
        },
      ], NOW)
    ).toBe(true);
  });

  it("does not pull for future, final, or canceled games", () => {
    expect(
      isLiveSyncWindow([
        {
          start_time: "2026-09-13T20:00:00Z",
          is_over: false,
          in_progress: false,
          canceled: false,
        },
        {
          start_time: "2026-09-13T16:00:00Z",
          is_over: true,
          in_progress: false,
          canceled: false,
        },
      ], NOW)
    ).toBe(false);
  });
});

describe("score sync cooldown", () => {
  const scoreRun = {
    started_at: new Date(NOW - LIVE_SYNC_MIN_GAP_MS + 1).toISOString(),
    status: "ok",
    stats: { matchups: 32, weeks: 10 },
  };

  it("recognizes score-producing live and daily runs", () => {
    expect(isScoreRun(scoreRun)).toBe(true);
    expect(isScoreRun({ ...scoreRun, stats: { matchup_weeks: 51 } })).toBe(true);
    expect(isScoreRun({ ...scoreRun, stats: { players: 12_000 } })).toBe(false);
  });

  it("deduplicates recent score pulls", () => {
    expect(hasRecentScoreSync([scoreRun], NOW)).toBe(true);
    expect(
      hasRecentScoreSync([
        { ...scoreRun, status: "running", stats: null },
      ], NOW)
    ).toBe(true);
    expect(
      hasRecentScoreSync([
        { ...scoreRun, started_at: new Date(NOW - LIVE_SYNC_MIN_GAP_MS).toISOString() },
      ], NOW)
    ).toBe(false);
  });

  it("keeps cooldown leases isolated per provider", () => {
    expect(
      platformsNeedingScoreSync(
        ["sleeper", "yahoo"],
        [{ ...scoreRun, platform: "sleeper" }],
        NOW
      )
    ).toEqual(["yahoo"]);

    expect(
      platformsNeedingScoreSync(
        ["sleeper", "yahoo"],
        [
          { ...scoreRun, platform: "sleeper" },
          { ...scoreRun, platform: "yahoo", status: "running", stats: null },
        ],
        NOW
      )
    ).toEqual([]);
  });
});

describe("account sync cooldown", () => {
  const accountRun = {
    platform: "sleeper",
    started_at: new Date(NOW - ACCOUNT_SYNC_MIN_GAP_MS + 1).toISOString(),
    status: "ok",
    stats: { leagues: 10, roster_entries: 400 },
  };

  it("recognizes roster-producing account and daily runs", () => {
    expect(isAccountRun(accountRun)).toBe(true);
    expect(isAccountRun({ ...accountRun, stats: { matchups: 32 } })).toBe(false);
    expect(hasRecentAccountSync([accountRun], NOW)).toBe(true);
  });

  it("refreshes only providers without a recent account snapshot", () => {
    expect(
      platformsNeedingAccountSync(["sleeper", "yahoo"], [accountRun], NOW)
    ).toEqual(["yahoo"]);
  });
});
