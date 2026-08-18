import type {
  CanonicalLeague,
  CanonicalMatchup,
  CanonicalPlayerRef,
  CanonicalRosterEntry,
  CanonicalTeam,
  Credentials,
  PlatformAdapter,
  Sport,
} from "./types";
import { refreshYahooAccessToken } from "@/lib/yahoo-oauth";

const API = "https://fantasysports.yahooapis.com/fantasy/v2";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function numericValues(value: JsonRecord): unknown[] {
  return Object.keys(value)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => value[key]);
}

/** Yahoo encodes a resource as an array of small property objects. */
export function flattenYahooResource(value: unknown): JsonRecord {
  if (Array.isArray(value)) {
    return value.reduce<JsonRecord>((out, item) => Object.assign(out, flattenYahooResource(item)), {});
  }

  const item = record(value);
  const numbered = numericValues(item);
  if (numbered.length && Object.keys(item).every((key) => key === "count" || /^\d+$/.test(key))) {
    return numbered.reduce<JsonRecord>((out, child) => Object.assign(out, flattenYahooResource(child)), {});
  }
  return item;
}

/** Locate singular Yahoo resources without depending on their numeric wrappers. */
export function findYahooResources(payload: unknown, resourceName: string): unknown[] {
  const found: unknown[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = record(value);
    if (!Object.keys(item).length) return;
    if (resourceName in item) found.push(item[resourceName]);
    Object.values(item).forEach(visit);
  };
  visit(payload);
  return found;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numeric(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function yahooCreds(creds: Credentials): Extract<Credentials, { platform: "yahoo" }> {
  if (creds.platform !== "yahoo") throw new Error("Yahoo adapter received non-Yahoo credentials.");
  return creds;
}

async function get(path: string, creds: Credentials): Promise<unknown> {
  const accessToken = yahooCreds(creds).accessToken;
  if (!accessToken) throw new Error("Yahoo access token has not been refreshed.");
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API}${path}${separator}format=json`, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Yahoo Fantasy request failed with status ${response.status}.`);
  return response.json();
}

function resourceKey(value: unknown, key: string): string | null {
  return text(flattenYahooResource(value)[key]);
}

function uniqueResources(values: unknown[], key: string): unknown[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = resourceKey(value, key);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function rosterSlots(settings: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const raw of findYahooResources(settings, "roster_position")) {
    const position = text(flattenYahooResource(raw).position);
    const count = numeric(flattenYahooResource(raw).count);
    if (position && count) out[position] = (out[position] ?? 0) + count;
  }
  return out;
}

function leagueStatus(league: JsonRecord): CanonicalLeague["status"] {
  if (truthy(league.is_finished)) return "complete";
  return league.draft_status === "postdraft" ? "in_season" : "pre_draft";
}

function leagueType(settings: JsonRecord): CanonicalLeague["leagueType"] {
  return truthy(settings.keeper_enable) || truthy(settings.uses_keeper)
    ? "keeper"
    : "redraft";
}

function parseTeam(raw: unknown): CanonicalTeam | null {
  const team = flattenYahooResource(raw);
  const externalId = text(team.team_key);
  if (!externalId) return null;
  const manager = flattenYahooResource(findYahooResources(raw, "manager")[0]);
  const standings = flattenYahooResource(team.team_standings);
  const totals = flattenYahooResource(standings.outcome_totals);
  const logo = flattenYahooResource(findYahooResources(team.team_logos, "team_logo")[0]);
  return {
    externalId,
    name: text(team.name) ?? `Team ${externalId}`,
    managerName: text(manager.nickname) ?? text(manager.name),
    avatarUrl: text(logo.url),
    isMine: truthy(team.is_owned_by_current_login),
    record: {
      wins: numeric(totals.wins) ?? 0,
      losses: numeric(totals.losses) ?? 0,
      ties: numeric(totals.ties) ?? 0,
    },
    pointsFor: numeric(flattenYahooResource(team.team_points).total) ?? 0,
    pointsAgainst: numeric(standings.points_against) ?? 0,
    standing: numeric(standings.rank),
  };
}

interface YahooPlayer {
  externalId: string;
  slot: string;
  isStarter: boolean;
  currentPoints: number | null;
  projectedPoints: number | null;
  ref: CanonicalPlayerRef;
}

function parsePlayers(teamRaw: unknown): YahooPlayer[] {
  return uniqueResources(findYahooResources(teamRaw, "player"), "player_key").flatMap((raw) => {
    const player = flattenYahooResource(raw);
    const externalId = text(player.player_key);
    if (!externalId) return [];
    const selected = flattenYahooResource(player.selected_position);
    const name = flattenYahooResource(player.name);
    const slot = text(selected.position) ?? "BN";
    return [{
      externalId,
      slot,
      isStarter: !["BN", "IR", "IR+", "IL", "IL+", "NA"].includes(slot.toUpperCase()),
      currentPoints: numeric(flattenYahooResource(player.player_points).total),
      projectedPoints: numeric(flattenYahooResource(player.player_projected_points).total),
      ref: {
        externalId,
        fullName: text(name.full) ?? text(player.name) ?? externalId,
        position: text(player.display_position),
        teamAbbr: text(player.editorial_team_abbr),
      },
    }];
  });
}

async function leagueTeamKeys(creds: Credentials, leagueId: string): Promise<string[]> {
  const payload = await get(`/league/${encodeURIComponent(leagueId)}/teams`, creds);
  return uniqueResources(findYahooResources(payload, "team"), "team_key")
    .flatMap((team) => resourceKey(team, "team_key") ?? []);
}

async function rosterTeams(creds: Credentials, teamKeys: string[], week?: number): Promise<unknown[]> {
  if (!teamKeys.length) return [];
  const weekFilter = week ? `;week=${week}` : "";
  const keys = teamKeys.map(encodeURIComponent).join(",");
  const payload = await get(`/teams;team_keys=${keys}/roster${weekFilter}`, creds);
  return uniqueResources(findYahooResources(payload, "team"), "team_key");
}

export const yahooAdapter: PlatformAdapter = {
  platform: "yahoo",

  async refreshCredentials(creds) {
    const current = yahooCreds(creds);
    const refreshed = await refreshYahooAccessToken(current.refreshToken);
    return {
      platform: "yahoo",
      refreshToken: refreshed.refreshToken,
      accessToken: refreshed.accessToken,
    };
  },

  async healthCheck(creds) {
    try {
      await get("/users;use_login=1/games;game_keys=nfl", creds);
      return true;
    } catch {
      return false;
    }
  },

  async listLeagues(creds, sport: Sport, season: number): Promise<CanonicalLeague[]> {
    const payload = await get(`/users;use_login=1/games;game_keys=${sport}/leagues`, creds);
    const leagues = uniqueResources(findYahooResources(payload, "league"), "league_key")
      .filter((raw) => numeric(flattenYahooResource(raw).season) === season);

    return Promise.all(leagues.map(async (raw) => {
      const league = flattenYahooResource(raw);
      const externalId = text(league.league_key)!;
      const settingsPayload = await get(`/league/${encodeURIComponent(externalId)}/settings`, creds);
      const settingsRaw = findYahooResources(settingsPayload, "settings")[0] ?? {};
      const settings = flattenYahooResource(settingsRaw);
      return {
        externalId,
        sport,
        season,
        name: text(league.name) ?? `Yahoo league ${externalId}`,
        teamCount: numeric(league.num_teams) ?? 0,
        scoringType: "custom",
        scoringRaw: { league, settings },
        rosterSlots: rosterSlots(settingsRaw),
        currentWeek: numeric(league.current_week),
        status: leagueStatus(league),
        format: "head_to_head",
        leagueType: leagueType(settings),
      } satisfies CanonicalLeague;
    }));
  },

  async getTeams(creds, leagueId): Promise<CanonicalTeam[]> {
    const payload = await get(`/league/${encodeURIComponent(leagueId)}/standings`, creds);
    return uniqueResources(findYahooResources(payload, "team"), "team_key")
      .map(parseTeam)
      .filter((team): team is CanonicalTeam => team !== null);
  },

  async getRosters(creds, leagueId, _season, week): Promise<CanonicalRosterEntry[]> {
    const teams = await rosterTeams(creds, await leagueTeamKeys(creds, leagueId), week);
    return teams.flatMap((teamRaw) => {
      const teamExternalId = resourceKey(teamRaw, "team_key");
      if (!teamExternalId) return [];
      return parsePlayers(teamRaw).map((player, lineupOrder) => ({
        teamExternalId,
        externalPlayerId: player.externalId,
        slot: player.slot,
        isStarter: player.isStarter,
        lineupOrder,
        week: week ?? null,
        playerRef: player.ref,
      }));
    });
  },

  async getMatchups(creds, leagueId, _season, week): Promise<CanonicalMatchup[]> {
    const scoreboard = await get(`/league/${encodeURIComponent(leagueId)}/scoreboard;week=${week}`, creds);
    const matchupTeamKeys = uniqueResources(findYahooResources(scoreboard, "team"), "team_key")
      .flatMap((team) => resourceKey(team, "team_key") ?? []);
    const rosterRows = await rosterTeams(creds, matchupTeamKeys, week);
    const playersByTeam = new Map(rosterRows.flatMap((teamRaw) => {
      const key = resourceKey(teamRaw, "team_key");
      return key ? [[key, parsePlayers(teamRaw)] as const] : [];
    }));
    const matchups = findYahooResources(scoreboard, "matchup");

    return matchups.flatMap((matchupRaw, matchupIndex) => {
      const matchup = flattenYahooResource(matchupRaw);
      const teams = uniqueResources(findYahooResources(matchupRaw, "team"), "team_key")
        .map((raw) => ({ raw, flat: flattenYahooResource(raw) }))
        .filter(({ flat }) => text(flat.team_key));
      if (teams.length < 1) return [];
      const matchupKey = `${week}-${text(matchup.matchup_recap_title) ?? matchupIndex}`;
      return teams.map(({ flat }, index) => {
        const teamExternalId = text(flat.team_key)!;
        const opponent = teams.find((_, opponentIndex) => opponentIndex !== index);
        const players = playersByTeam.get(teamExternalId) ?? [];
        const starterPlayers = players.filter((player) => player.isStarter);
        const projectedFromPlayers = starterPlayers.every((player) => player.projectedPoints !== null)
          ? starterPlayers.reduce((sum, player) => sum + player.projectedPoints!, 0)
          : null;
        return {
          week,
          matchupKey,
          teamExternalId,
          opponentExternalId: opponent ? text(opponent.flat.team_key) : null,
          points: numeric(flattenYahooResource(flat.team_points).total),
          projectedPoints: numeric(flattenYahooResource(flat.team_projected_points).total)
            ?? projectedFromPlayers,
          isFinal: matchup.status === "postevent" || matchup.status === "final",
          playerStats: players.map((player, lineupOrder) => ({
            externalPlayerId: player.externalId,
            isStarter: player.isStarter,
            lineupOrder,
            currentPoints: player.currentPoints,
            projectedPoints: player.projectedPoints,
          })),
        };
      });
    });
  },

  async getTransactions() {
    // The first Yahoo slice is read-only leagues, teams, rosters, and matchups.
    // Transaction normalization remains intentionally disabled until fixtures
    // are recorded from an authorized Yahoo account.
    return [];
  },
};
