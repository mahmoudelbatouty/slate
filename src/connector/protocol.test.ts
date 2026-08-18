import { describe, expect, it } from "vitest";
import { connectorEnvelope, nativeProjections } from "./protocol";

const valid = {
  version: 1,
  platform: "sleeper",
  kind: "matchup_legs",
  capturedAt: "2026-08-13T00:00:00.000Z",
  matchups: [
    {
      league_id: "1313273030905974784",
      round: 1,
      roster_id: 4,
      matchup_id: 1,
      points: 0,
      proj_points: 180.356,
      starters: ["11564", "8138"],
      player_map: { "11564": 0 },
    },
  ],
} as const;

const espnValid = {
  version: 1,
  platform: "espn",
  kind: "league_snapshot",
  capturedAt: "2026-08-18T02:00:00.000Z",
  snapshots: [{
    leagueId: "12345",
    season: 2026,
    name: "Fixture League",
    teamCount: 2,
    currentWeek: 1,
    status: "in_season",
    myTeamId: "1",
    rosterSlots: { QB: 1, BN: 5 },
    teams: [{
      id: "1",
      name: "My ESPN Team",
      abbreviation: "MET",
      managerName: "Manager",
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      standing: null,
      roster: [{
        id: "4040715",
        name: "Player Example",
        position: "QB",
        proTeam: "WAS",
        lineupSlot: "QB",
        injuryStatus: "ACTIVE",
        currentPoints: 0,
        projectedPoints: 20.5,
      }],
    }],
    matchups: [{
      id: "1",
      week: 1,
      isFinal: false,
      homeTeamId: "1",
      awayTeamId: "2",
      homePoints: 0,
      awayPoints: 0,
      homeProjected: 120.5,
      awayProjected: 118.2,
    }],
  }],
} as const;

describe("connector protocol", () => {
  it("accepts only Sleeper's public numeric identity", () => {
    const identity = {
      version: 1,
      platform: "sleeper",
      kind: "account_identity",
      capturedAt: "2026-08-18T02:00:00.000Z",
      userId: "123456789",
    } as const;
    expect(connectorEnvelope.parse(identity)).toEqual(identity);
    expect(() => connectorEnvelope.parse({ ...identity, token: "forbidden" })).toThrow();
    expect(() => connectorEnvelope.parse({ ...identity, userId: "name@example.com" })).toThrow();
    expect(nativeProjections(connectorEnvelope.parse(identity))).toEqual([]);
  });
  it("accepts only the approved Sleeper matchup shape", () => {
    const envelope = connectorEnvelope.parse(valid);
    expect(envelope.platform).toBe("sleeper");
    if (envelope.platform !== "sleeper" || envelope.kind !== "matchup_legs") throw new Error("Expected Sleeper matchup envelope");
    expect(envelope.matchups).toHaveLength(1);
    expect(() =>
      connectorEnvelope.parse({ ...valid, platform: "unknown" })
    ).toThrow();
  });

  it("normalizes native team projections and rounds for storage", () => {
    const envelope = connectorEnvelope.parse(valid);
    expect(nativeProjections(envelope)).toEqual([
      {
        externalLeagueId: "1313273030905974784",
        externalTeamId: "4",
        week: 1,
        projectedPoints: 180.36,
      },
    ]);
  });

  it("drops rows where the provider supplied no projection", () => {
    const envelope = connectorEnvelope.parse({
      ...valid,
      matchups: [{ ...valid.matchups[0], proj_points: null }],
    });
    expect(nativeProjections(envelope)).toEqual([]);
  });

  it("accepts only the sanitized ESPN league snapshot", () => {
    const envelope = connectorEnvelope.parse(espnValid);
    expect(envelope.platform).toBe("espn");
    if (envelope.platform !== "espn") throw new Error("Expected ESPN envelope");
    expect(envelope.snapshots[0].teams[0].roster).toHaveLength(1);
    expect(() => connectorEnvelope.parse({
      ...espnValid,
      snapshots: [{ ...espnValid.snapshots[0], cookies: "forbidden" }],
    })).toThrow();
    expect(() => connectorEnvelope.parse({
      ...espnValid,
      snapshots: [{ ...espnValid.snapshots[0], leagueId: "../../session" }],
    })).toThrow();
  });

  it("never treats ESPN snapshots as Sleeper projection overrides", () => {
    expect(nativeProjections(connectorEnvelope.parse(espnValid))).toEqual([]);
  });
});
