import { describe, expect, it } from "vitest";
import { fillEmptyStarterSlots } from "./lineup-slots";
import type { MatchupPlayer } from "./matchup";

// Elite Dynasty League, week 1: Sleeper returns ten starting slots with two
// left empty, and the adapter stores the eight that are filled.
const POSITIONS = [
  "QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "FLEX", "FLEX", "SUPER_FLEX",
  "BN", "BN", "BN",
];

function starter(lineupOrder: number, slot: string): MatchupPlayer {
  return {
    externalPlayerId: `p${lineupOrder}`,
    name: `Player ${lineupOrder}`,
    position: slot,
    nflTeam: "PHI",
    slot,
    isStarter: true,
    lineupOrder,
    currentPoints: null,
    projectedPoints: 10,
    injuryStatus: null,
    game: null,
  };
}

describe("fillEmptyStarterSlots", () => {
  it("restores the slots the provider left empty", () => {
    const stored = [
      starter(0, "QB"), starter(1, "RB"), starter(2, "RB"), starter(3, "WR"),
      starter(4, "WR"), starter(5, "TE"), starter(6, "FLEX"), starter(9, "SUPER_FLEX"),
    ];

    const filled = fillEmptyStarterSlots(stored, POSITIONS);

    expect(filled).toHaveLength(10);
    expect(filled.map((p) => p.lineupOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(filled[7]).toMatchObject({ isEmptySlot: true, slot: "FLEX" });
    expect(filled[8]).toMatchObject({ isEmptySlot: true, slot: "FLEX" });
    expect(filled[9].externalPlayerId).toBe("p9");
  });

  it("leaves a full lineup untouched", () => {
    const stored = Array.from({ length: 10 }, (_, i) => starter(i, POSITIONS[i]));
    expect(fillEmptyStarterSlots(stored, POSITIONS)).toEqual(stored);
  });

  it("leaves an empty lineup alone rather than inventing a whole roster", () => {
    expect(fillEmptyStarterSlots([], POSITIONS)).toEqual([]);
  });

  it("does nothing without ordered roster positions", () => {
    const stored = [starter(0, "QB"), starter(9, "SUPER_FLEX")];
    expect(fillEmptyStarterSlots(stored, [])).toEqual(stored);
  });

  it("refuses to guess when the provider's order does not line up", () => {
    // Duplicate order, and an order past the end of the starting slots: both
    // mean this provider does not index starters the way Sleeper does.
    expect(fillEmptyStarterSlots([starter(0, "QB"), starter(0, "RB")], POSITIONS)).toHaveLength(2);
    expect(fillEmptyStarterSlots([starter(0, "QB"), starter(44, "RB")], POSITIONS)).toHaveLength(2);
  });

  it("ignores bench slots when counting the starting lineup", () => {
    const stored = [starter(0, "QB")];
    const filled = fillEmptyStarterSlots(stored, ["QB", "RB", "BN", "BN", "IR", "TAXI"]);
    expect(filled.map((p) => p.slot)).toEqual(["QB", "RB"]);
  });
});
