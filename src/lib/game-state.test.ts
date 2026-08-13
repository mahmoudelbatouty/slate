import { describe, expect, it } from "vitest";
import { buildLeftToPlay, formatGameWindow, winProbability, type StarterGame } from "./game-state";

const row = (overrides: Partial<StarterGame> = {}): StarterGame => ({
  leagueId: "league",
  teamId: "team",
  isMine: true,
  startTime: "2025-11-16T18:00:00.000Z",
  isOver: false,
  inProgress: false,
  canceled: false,
  quarter: null,
  projectedPoints: 10,
  ...overrides,
});

describe("buildLeftToPlay", () => {
  it("groups duplicate starters across leagues into derived kickoff windows", () => {
    const spine = buildLeftToPlay([
      row({ isOver: true }),
      row({ leagueId: "other", inProgress: true, quarter: "2" }),
      row({ startTime: "2025-11-17T01:20:00.000Z" }),
      row({ startTime: null }),
      row({ isMine: false }),
    ], "2025-11-16T17:00:00.000Z");

    expect(spine).toMatchObject({ total: 4, played: 1, live: 1, remaining: 1, unassigned: 1 });
    expect(spine.windows.map((window) => window.label)).toEqual(["1:00 PM", "8:20 PM"]);
    expect(spine.windows[0].dots).toEqual(["played", "live"]);
  });

  it("formats windows in Eastern time regardless of server timezone", () => {
    expect(formatGameWindow("2025-11-16T21:25:00.000Z")).toBe("4:25 PM");
  });

  it("shows only today's Eastern-time slate", () => {
    const spine = buildLeftToPlay([
      row(),
      row({ startTime: "2025-11-17T01:20:00.000Z" }),
      row({ startTime: "2025-11-18T01:15:00.000Z" }),
    ], "2025-11-16T17:00:00.000Z");
    expect(spine.total).toBe(2);
    expect(spine.windows.map((window) => window.label)).toEqual(["1:00 PM", "8:20 PM"]);
  });

  it("renders empty when there are no games today", () => {
    expect(buildLeftToPlay([row()], "2025-11-12T17:00:00.000Z").total).toBe(0);
  });
});

describe("winProbability", () => {
  it("keeps a trailing team alive when it has more projection left", () => {
    const mine = [row({ projectedPoints: 22 }), row({ projectedPoints: 18 })];
    const opponent = [row({ isOver: true }), row({ isOver: true })];
    expect(winProbability(80, 95, mine, opponent, false)).toBeGreaterThan(70);
  });

  it("shrinks uncertainty as games finish", () => {
    const early = winProbability(88, 100, [row({ projectedPoints: 12 })], [row({ isOver: true })], false);
    const late = winProbability(88, 100, [row({ projectedPoints: 12, inProgress: true, quarter: "4" })], [row({ isOver: true })], false);
    expect(early).toBeGreaterThan(late ?? 0);
    expect(late).toBeLessThan(10);
  });

  it("does not invent a probability when a remaining projection is missing", () => {
    expect(winProbability(10, 10, [row({ projectedPoints: null })], [row()], false)).toBeNull();
  });

  it("settles final matchups deterministically", () => {
    expect(winProbability(101, 99, [], [], true)).toBe(100);
    expect(winProbability(99, 101, [], [], true)).toBe(0);
  });
});
