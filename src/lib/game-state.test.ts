import { describe, expect, it } from "vitest";
import { summarizeStarterStates, winProbability, type StarterGame } from "./game-state";

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

describe("summarizeStarterStates", () => {
  it("summarizes the whole selected gameweek for one matchup side", () => {
    expect(summarizeStarterStates([
      row({ isOver: true }),
      row({ inProgress: true, quarter: "2" }),
      row({ startTime: "2025-11-17T01:20:00.000Z" }),
      row({ startTime: null }),
      row({ canceled: true }),
    ])).toEqual({
      total: 5,
      remaining: 2,
      played: 1,
      live: 1,
      upcoming: 1,
      unassigned: 2,
    });
  });

  it("shows that nobody has played an upcoming gameweek", () => {
    expect(summarizeStarterStates([row(), row()])).toMatchObject({
      total: 2,
      played: 0,
      live: 0,
      upcoming: 2,
      remaining: 2,
    });
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
