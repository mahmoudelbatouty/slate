import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/yahoo-oauth", () => ({
  refreshYahooAccessToken: vi.fn(async (refreshToken: string) => ({
    accessToken: "access",
    refreshToken,
    expiresIn: 3600,
  })),
}));

import { findYahooResources, flattenYahooResource, yahooAdapter } from "./yahoo";
import type { Credentials } from "./types";

const creds: Credentials = { platform: "yahoo", refreshToken: "refresh", accessToken: "access" };
const leagueKey = "449.l.123";
const teamOne = `${leagueKey}.t.1`;
const teamTwo = `${leagueKey}.t.2`;

const player = (key: string, full: string, position: string, slot: string, points: string, projected: string) => ({
  player: [
    { player_key: key },
    { name: { full } },
    { display_position: position },
    { editorial_team_abbr: "PHI" },
    { selected_position: [{ position: slot }] },
    { player_points: { total: points } },
    { player_projected_points: { total: projected } },
  ],
});

const rosterTeam = (key: string, name: string, players: unknown[]) => ({
  team: [
    [{ team_key: key }, { name }],
    { roster: { 0: { players: Object.fromEntries(players.map((value, index) => [index, value])) } } },
  ],
});

const fixtures: Record<string, unknown> = {
  leagues: {
    fantasy_content: { users: { 0: { user: [{}, { games: { 0: { game: [{}, { leagues: {
      0: { league: [
        { league_key: leagueKey }, { name: "Keep Forever" }, { season: "2026" },
        { num_teams: 2 }, { current_week: "1" }, { draft_status: "postdraft" }, { is_finished: 0 },
      ] },
    } }] } } }] } } },
  },
  settings: {
    fantasy_content: { league: [{ league_key: leagueKey }, { settings: [
      { keeper_enable: "1" },
      { roster_positions: {
        0: { roster_position: [{ position: "QB" }, { count: "1" }] },
        1: { roster_position: [{ position: "BN" }, { count: "2" }] },
      } },
    ] }] },
  },
  teams: {
    fantasy_content: { league: [{}, { teams: {
      0: { team: [
        [{ team_key: teamOne }, { name: "My Yahoo Team" }, { is_owned_by_current_login: 1 }],
        { managers: { 0: { manager: [{ nickname: "Owner" }] } } },
        { team_points: { total: "101.25" } },
        { team_standings: { rank: "1", outcome_totals: { wins: "1", losses: "0", ties: "0" } } },
      ] },
      1: { team: [[{ team_key: teamTwo }, { name: "Opponent" }]] },
    } }] },
  },
  rosters: {
    fantasy_content: { league: [{}, { teams: {
      0: rosterTeam(teamOne, "My Yahoo Team", [
        player("449.p.10", "Jalen Hurts", "QB", "QB", "22.4", "24.8"),
        player("449.p.11", "A.J. Brown", "WR", "BN", "8.1", "13.2"),
      ]),
      1: rosterTeam(teamTwo, "Opponent", [
        player("449.p.20", "Saquon Barkley", "RB", "RB", "18.3", "19.7"),
      ]),
    } }] },
  },
  scoreboard: {
    fantasy_content: { league: [{}, { scoreboard: { 0: { matchups: {
      0: { matchup: [
        { week: "1" }, { status: "midevent" },
        { 0: { teams: {
          0: { team: [{ team_key: teamOne }, { team_points: { total: "101.25" } }] },
          1: { team: [{ team_key: teamTwo }, { team_points: { total: "98.50" } }] },
        } } },
      ] },
    } } } }] },
  },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    const body = url.includes("/settings") ? fixtures.settings
      : url.includes("/scoreboard") ? fixtures.scoreboard
        : url.includes("/teams;team_keys=") ? fixtures.rosters
          : url.includes("/standings") || url.includes(`/league/${leagueKey}/teams`) ? fixtures.teams
            : fixtures.leagues;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("Yahoo JSON helpers", () => {
  it("flattens property arrays and discovers numerically wrapped resources", () => {
    expect(flattenYahooResource([{ league_key: leagueKey }, { name: "League" }])).toEqual({
      league_key: leagueKey,
      name: "League",
    });
    expect(findYahooResources(fixtures.leagues, "league")).toHaveLength(1);
  });
});

describe("yahooAdapter", () => {
  it("normalizes leagues and keeper settings", async () => {
    await expect(yahooAdapter.listLeagues(creds, "nfl", 2026)).resolves.toEqual([
      expect.objectContaining({
        externalId: leagueKey,
        name: "Keep Forever",
        currentWeek: 1,
        status: "in_season",
        leagueType: "keeper",
        rosterSlots: { QB: 1, BN: 2 },
      }),
    ]);
  });

  it("normalizes teams and identifies the current user's team", async () => {
    const teams = await yahooAdapter.getTeams(creds, leagueKey, 2026);
    expect(teams).toHaveLength(2);
    expect(teams[0]).toMatchObject({
      externalId: teamOne,
      name: "My Yahoo Team",
      managerName: "Owner",
      isMine: true,
      pointsFor: 101.25,
      standing: 1,
      record: { wins: 1, losses: 0, ties: 0 },
    });
  });

  it("preserves Yahoo lineup order, slots, and player crosswalk metadata", async () => {
    const entries = await yahooAdapter.getRosters(creds, leagueKey, 2026, 1);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      teamExternalId: teamOne,
      externalPlayerId: "449.p.10",
      slot: "QB",
      isStarter: true,
      lineupOrder: 0,
      playerRef: { fullName: "Jalen Hurts", position: "QB", teamAbbr: "PHI" },
    });
    expect(entries[1]).toMatchObject({ slot: "BN", isStarter: false, lineupOrder: 1 });
  });

  it("normalizes head-to-head scores and provider projections", async () => {
    const matchups = await yahooAdapter.getMatchups(creds, leagueKey, 2026, 1);
    expect(matchups).toHaveLength(2);
    expect(matchups[0]).toMatchObject({
      teamExternalId: teamOne,
      opponentExternalId: teamTwo,
      points: 101.25,
      projectedPoints: 24.8,
      isFinal: false,
    });
    expect(matchups[0].playerStats).toEqual([
      expect.objectContaining({ externalPlayerId: "449.p.10", currentPoints: 22.4, projectedPoints: 24.8 }),
      expect.objectContaining({ externalPlayerId: "449.p.11", currentPoints: 8.1, projectedPoints: 13.2 }),
    ]);
  });
});
