import { describe, expect, it } from "vitest";
import { CrosswalkIndex, normalizeName, type CanonicalPlayerRow } from "./crosswalk";
import type { CanonicalPlayerRef } from "@/adapters/types";

const rows: CanonicalPlayerRow[] = [
  {
    id: "uuid-hill",
    full_name: "Tyreek Hill",
    position: "WR",
    team_abbr: "MIA",
    gsis_id: "00-0033040",
    sportradar_id: "sr-hill",
  },
  {
    id: "uuid-brown",
    full_name: "A.J. Brown Jr.",
    position: "WR",
    team_abbr: "PHI",
    gsis_id: null,
    sportradar_id: null,
  },
  {
    id: "uuid-smith-a",
    full_name: "Mike Smith",
    position: "RB",
    team_abbr: "DAL",
    gsis_id: null,
    sportradar_id: null,
  },
  {
    id: "uuid-smith-b",
    full_name: "Mike Smith",
    position: "RB",
    team_abbr: "NYG",
    gsis_id: null,
    sportradar_id: null,
  },
];

const index = new CrosswalkIndex(rows);

const ref = (over: Partial<CanonicalPlayerRef>): CanonicalPlayerRef => ({
  externalId: "x",
  fullName: "Nobody",
  position: null,
  teamAbbr: null,
  ...over,
});

describe("normalizeName", () => {
  it("folds punctuation, case, accents, and generational suffixes", () => {
    expect(normalizeName("A.J. Brown Jr.")).toBe("ajbrown");
    expect(normalizeName("aj brown")).toBe("ajbrown");
    expect(normalizeName("Amon-Ra St. Brown")).toBe("amonrastbrown");
    expect(normalizeName("José Álvarez")).toBe("josealvarez");
    expect(normalizeName("Odell Beckham III")).toBe("odellbeckham");
  });
});

describe("CrosswalkIndex", () => {
  it("matches on gsis_id at full confidence", () => {
    expect(index.match(ref({ gsisId: "00-0033040" }))).toEqual({
      playerId: "uuid-hill",
      confidence: 1.0,
    });
  });

  it("matches on sportradar_id at full confidence", () => {
    expect(index.match(ref({ sportradarId: "sr-hill" }))).toEqual({
      playerId: "uuid-hill",
      confidence: 1.0,
    });
  });

  it("prefers an id match over a name match", () => {
    const match = index.match(
      ref({ gsisId: "00-0033040", fullName: "A.J. Brown", position: "WR", teamAbbr: "PHI" })
    );
    expect(match?.playerId).toBe("uuid-hill");
  });

  it("falls to name + position + team at 0.9", () => {
    expect(
      index.match(ref({ fullName: "AJ Brown", position: "WR", teamAbbr: "PHI" }))
    ).toEqual({ playerId: "uuid-brown", confidence: 0.9 });
  });

  it("falls to name + position at 0.7 when the team is wrong or missing", () => {
    expect(index.match(ref({ fullName: "A.J. Brown", position: "WR" }))).toEqual({
      playerId: "uuid-brown",
      confidence: 0.7,
    });
  });

  it("refuses to guess between two players with the same name and position", () => {
    // This is the /admin/unmatched case: a human decides, not a coin flip.
    expect(index.match(ref({ fullName: "Mike Smith", position: "RB" }))).toBeNull();
  });

  it("still resolves an ambiguous name when the team disambiguates it", () => {
    expect(
      index.match(ref({ fullName: "Mike Smith", position: "RB", teamAbbr: "NYG" }))
    ).toEqual({ playerId: "uuid-smith-b", confidence: 0.9 });
  });

  it("returns null rather than a bad match", () => {
    expect(index.match(ref({ fullName: "Nobody At All", position: "QB" }))).toBeNull();
  });
});
