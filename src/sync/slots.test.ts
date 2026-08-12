import { describe, expect, it } from "vitest";
import { resolveSlot, rosterPositionsFromRaw, startingPositions } from "./slots";

const POSITIONS = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "K",
  "DEF",
  "BN",
  "BN",
  "IR",
];

describe("startingPositions", () => {
  it("drops bench, IR, and taxi", () => {
    expect(startingPositions(POSITIONS)).toEqual([
      "QB",
      "RB",
      "RB",
      "WR",
      "WR",
      "TE",
      "FLEX",
      "K",
      "DEF",
    ]);
  });
});

describe("resolveSlot", () => {
  it("maps positional placeholders onto real slot names", () => {
    expect(resolveSlot("S0", POSITIONS)).toBe("QB");
    expect(resolveSlot("S3", POSITIONS)).toBe("WR");
    expect(resolveSlot("S6", POSITIONS)).toBe("FLEX");
    expect(resolveSlot("S8", POSITIONS)).toBe("DEF");
  });

  it("passes through slots that are already named", () => {
    expect(resolveSlot("BN", POSITIONS)).toBe("BN");
    expect(resolveSlot("IR", POSITIONS)).toBe("IR");
  });

  it("falls back to the placeholder rather than guessing", () => {
    expect(resolveSlot("S99", POSITIONS)).toBe("S99");
    expect(resolveSlot("S0", [])).toBe("S0");
  });
});

describe("rosterPositionsFromRaw", () => {
  it("reads the ordered list out of the raw scoring blob", () => {
    expect(rosterPositionsFromRaw({ roster_positions: POSITIONS })).toEqual(POSITIONS);
  });

  it("returns empty for anything unexpected instead of throwing", () => {
    expect(rosterPositionsFromRaw(null)).toEqual([]);
    expect(rosterPositionsFromRaw(undefined)).toEqual([]);
    expect(rosterPositionsFromRaw("nope")).toEqual([]);
    expect(rosterPositionsFromRaw({})).toEqual([]);
    expect(rosterPositionsFromRaw({ roster_positions: "QB" })).toEqual([]);
    expect(rosterPositionsFromRaw({ roster_positions: ["QB", 7] })).toEqual(["QB"]);
  });
});
