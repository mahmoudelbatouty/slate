import { describe, expect, it } from "vitest";
import { espnLeagueSnapshot } from "@/connector/protocol";
import { normalizeEspnSnapshot } from "./espn";

const snapshot = espnLeagueSnapshot.parse({
  leagueId: "123",
  season: 2026,
  name: "ESPN League",
  teamCount: 2,
  currentWeek: 3,
  status: "in_season",
  myTeamId: "1",
  rosterSlots: { QB: 1, BN: 1 },
  teams: [
    { id: "1", name: "Mine", abbreviation: "MIN", managerName: "Me", wins: 2, losses: 0, ties: 0, pointsFor: 250, pointsAgainst: 200, standing: 1, roster: [
      { id: "p1", name: "Quarterback", position: "QB", proTeam: "WAS", lineupSlot: "QB", injuryStatus: null, currentPoints: 10, projectedPoints: 20 },
    ] },
    { id: "2", name: "Theirs", abbreviation: "OPP", managerName: "Them", wins: 1, losses: 1, ties: 0, pointsFor: 220, pointsAgainst: 210, standing: 2, roster: [] },
  ],
  matchups: [{ id: "m3", week: 3, isFinal: false, homeTeamId: "1", awayTeamId: "2", homePoints: 10, awayPoints: 8, homeProjected: 120, awayProjected: 115 }],
});

describe("normalizeEspnSnapshot", () => {
  it("normalizes league, ownership, standings, and roster order", () => {
    const canonical = normalizeEspnSnapshot(snapshot);
    expect(canonical.league).toMatchObject({ externalId: "123", currentWeek: 3, teamCount: 2 });
    expect(canonical.teams.find((team) => team.isMine)?.externalId).toBe("1");
    expect(canonical.teams[0].record).toEqual({ wins: 2, losses: 0, ties: 0 });
    expect(canonical.rosters[0]).toMatchObject({ externalPlayerId: "p1", slot: "QB", isStarter: true, lineupOrder: 0 });
  });

  it("emits reciprocal canonical matchup rows with native projections", () => {
    const rows = normalizeEspnSnapshot(snapshot).matchups;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ teamExternalId: "1", opponentExternalId: "2", projectedPoints: 120 });
    expect(rows[1]).toMatchObject({ teamExternalId: "2", opponentExternalId: "1", projectedPoints: 115 });
  });
});
