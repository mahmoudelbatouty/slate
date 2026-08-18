import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

interface BackgroundApi {
  normalizeLeagueRef(value: unknown): { leagueId: string; season: number; teamId: string | null } | null;
  buildLeagueUrl(value: unknown): string | null;
  sanitizeResponse(json: unknown, value: unknown): Record<string, unknown> | null;
}

function loadApi(): BackgroundApi {
  const self: { SlateEspnBackground?: BackgroundApi } = {};
  const source = readFileSync(join(process.cwd(), "connector", "espn-background.js"), "utf8");
  vm.runInNewContext(source, { self, URL });
  if (!self.SlateEspnBackground) throw new Error("ESPN background helper did not load");
  return self.SlateEspnBackground;
}

const api = loadApi();

describe("ESPN background connector boundary", () => {
  it("requests scheduling and exact ESPN hosts without cookie-read permission", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "connector", "manifest.json"), "utf8")
    ) as { permissions: string[]; host_permissions: string[] };
    expect(manifest.permissions).toContain("alarms");
    expect(manifest.permissions).not.toContain("cookies");
    expect(manifest.host_permissions).toContain("https://lm-api-reads.fantasy.espn.com/*");
  });

  it("accepts only numeric league references in the supported season range", () => {
    expect(api.normalizeLeagueRef({ leagueId: "1885533299", season: 2026, teamId: "4" }))
      .toEqual({ leagueId: "1885533299", season: 2026, teamId: "4" });
    expect(api.normalizeLeagueRef({ leagueId: "../../cookies", season: 2026 })).toBeNull();
    expect(api.normalizeLeagueRef({ leagueId: "123", season: 1999 })).toBeNull();
    expect(api.normalizeLeagueRef({ leagueId: "123", season: 2026, teamId: "x" })).toBeNull();
  });

  it("constructs only the exact ESPN league-read URL with approved views", () => {
    const url = new URL(api.buildLeagueUrl({ leagueId: "1885533299", season: 2026, teamId: "4" })!);
    expect(url.origin).toBe("https://lm-api-reads.fantasy.espn.com");
    expect(url.pathname).toBe("/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1885533299");
    expect(url.searchParams.get("teamId")).toBe("4");
    expect(url.searchParams.getAll("view")).toEqual([
      "mTeam",
      "mRoster",
      "mMatchup",
      "mMatchupScore",
      "mSettings",
    ]);
  });

  it("reduces an ESPN response to the strict snapshot shape", () => {
    const snapshot = api.sanitizeResponse({
      id: 1885533299,
      seasonId: 2026,
      scoringPeriodId: 1,
      draftDetail: { drafted: false },
      settings: { name: "Jax Crew", size: 1, rosterSettings: { lineupSlotCounts: { 0: 1 } } },
      teams: [{
        id: 4,
        name: "Run CMC",
        secret: "must not survive",
        record: { overall: { wins: 0, losses: 0, ties: 0 } },
        roster: { entries: [] },
      }],
      schedule: [{ id: 1, matchupPeriodId: 1, home: { teamId: 4 }, away: {} }],
      secret: "must not survive",
    }, { leagueId: "1885533299", season: 2026, teamId: "4" });

    expect(snapshot).toMatchObject({
      leagueId: "1885533299",
      season: 2026,
      status: "pre_draft",
      myTeamId: "4",
      teamCount: 1,
    });
    expect(snapshot).not.toHaveProperty("secret");
    expect((snapshot?.teams as Array<Record<string, unknown>>)[0]).not.toHaveProperty("secret");
  });

  it("rejects a response for a different league or season", () => {
    const base = {
      id: 999,
      seasonId: 2026,
      scoringPeriodId: 1,
      teams: [{ id: 4, name: "Team 4" }],
    };
    expect(api.sanitizeResponse(base, { leagueId: "123", season: 2026, teamId: "4" })).toBeNull();
    expect(api.sanitizeResponse(
      { ...base, id: 123, seasonId: 2025 },
      { leagueId: "123", season: 2026, teamId: "4" }
    )).toBeNull();
  });
});
