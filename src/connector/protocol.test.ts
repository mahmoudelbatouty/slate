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

describe("connector protocol", () => {
  it("accepts only the approved Sleeper matchup shape", () => {
    expect(connectorEnvelope.parse(valid).matchups).toHaveLength(1);
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
});
