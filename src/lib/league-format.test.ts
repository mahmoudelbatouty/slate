import { describe, expect, it } from "vitest";
import { choppedSummary, sleeperLeagueFormat, sleeperLeagueType } from "./league-format";

describe("sleeperLeagueType", () => {
  it.each([
    [0, "redraft"],
    [1, "keeper"],
    [2, "dynasty"],
    [3, "redraft"],
  ] as const)("maps settings.type %s to %s", (type, expected) => {
    expect(sleeperLeagueType({ type })).toBe(expected);
  });

  it("defaults missing settings safely to redraft", () => {
    expect(sleeperLeagueType(null)).toBe("redraft");
  });
});

describe("sleeperLeagueFormat", () => {
  it("recognizes Sleeper's native Chopped type", () => {
    expect(sleeperLeagueFormat({ type: 3, playoff_week_start: 0 })).toBe("chopped");
  });

  it("defaults unknown settings safely to head-to-head", () => {
    expect(sleeperLeagueFormat(null)).toBe("head_to_head");
    expect(sleeperLeagueFormat({ type: 2 })).toBe("head_to_head");
  });
});

describe("choppedSummary", () => {
  const teams = [
    { teamId: "low", name: "Chop Zone", points: 74, projected: 81, isMine: false },
    { teamId: "me", name: "My Team", points: 80, projected: 95, isMine: true },
    { teamId: "high", name: "Safe Team", points: 90, projected: 110, isMine: false },
  ];

  it("orders the chopping block low-to-high and ranks mine high-to-low", () => {
    const summary = choppedSummary(teams);
    expect(summary.standings.map((team) => team.teamId)).toEqual(["low", "me", "high"]);
    expect(summary.myRank).toBe(2);
    expect(summary.chopZone?.teamId).toBe("low");
    expect(summary.marginAboveChop).toBe(14);
  });

  it("falls back to actual points and does not invent missing standings", () => {
    expect(choppedSummary([
      { teamId: "me", name: "Mine", points: 10, projected: null, isMine: true },
      { teamId: "missing", name: "Missing", points: null, projected: null, isMine: false },
    ])).toMatchObject({ myRank: 1, marginAboveChop: 0 });
  });
});
