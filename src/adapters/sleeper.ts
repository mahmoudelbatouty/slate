// ============================================================
// Sleeper adapter — reference implementation
//
// Read-only, public, no auth. This is the model the Yahoo and
// ESPN adapters should follow: fetch -> validate with Zod ->
// return canonical DTOs. Nothing platform-shaped escapes this file.
// ============================================================

import { z } from "zod";
import type {
  PlatformAdapter,
  Credentials,
  Sport,
  CanonicalLeague,
  CanonicalTeam,
  CanonicalRosterEntry,
  CanonicalMatchup,
  CanonicalTransaction,
  CanonicalPlayerRef,
} from "./types";
import { sleeperLeagueFormat, sleeperLeagueType } from "@/lib/league-format";
import { getSleeperGameState } from "./sleeper/scores";

const BASE = "https://api.sleeper.app/v1";

// Projections live on a DIFFERENT host and are undocumented. Publicly
// readable, but treat as unstable: validate loosely, degrade to null,
// never let a projection failure break a score sync.
const ALT = "https://api.sleeper.com";

// Sleeper docs: stay under 1000 req/min or risk an IP block.
// We're nowhere near that, but keep calls batched by league anyway.
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`sleeper ${res.status} ${path}`);
  const json = await res.json();
  if (json === null) throw new Error(`sleeper returned null for ${path}`);
  return json as T;
}

function creds(c: Credentials): { username: string } {
  if (c.platform !== "sleeper") throw new Error("wrong credentials for sleeper");
  return c;
}

// ---------- projections (undocumented host) ----------

const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

/**
 * Weekly projections for every player, keyed by Sleeper player_id.
 * One call covers all your leagues. Sleeper publishes the projected stat
 * line here, then its client applies each league's scoring_settings. Slate
 * mirrors that calculation so bonuses and custom categories match Sleeper.
 * Cache per (season, week) for ~1h.
 *
 * Returns an empty map on failure rather than throwing: a missing
 * projection should grey out a number, not fail the sync.
 */
type ProjectionStats = Record<string, number>;
type ProjectionMap = Map<string, ProjectionStats>;

// One call serves every league, so memoize per (season, week) for the life
// of the process. A sync run touching six leagues hits the host once.
// Failures are NOT cached — a transient 502 shouldn't blank projections
// until the next deploy.
const projectionCache = new Map<string, { at: number; map: ProjectionMap }>();
const PROJECTION_TTL_MS = 60 * 60 * 1000;

export function clearProjectionCache(): void {
  projectionCache.clear();
  rosterCache.clear();
}

export async function getProjections(
  season: number,
  week: number
): Promise<ProjectionMap> {
  const cacheKey = `${season}-${week}`;
  const hit = projectionCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PROJECTION_TTL_MS) return hit.map;

  const qs = new URLSearchParams({ season_type: "regular" });
  for (const p of POSITIONS) qs.append("position[]", p);

  try {
    const res = await fetch(`${ALT}/projections/nfl/${season}/${week}?${qs}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`sleeper projections ${res.status}`);

    const rows = (await res.json()) as Array<{
      player_id?: string;
      stats?: Record<string, number>;
    }>;

    const out: ProjectionMap = new Map();
    for (const r of rows) {
      if (!r.player_id || !r.stats) continue;
      const stats = Object.fromEntries(
        Object.entries(r.stats).filter((entry): entry is [string, number] =>
          Number.isFinite(entry[1])
        )
      );
      out.set(r.player_id, stats);
    }
    projectionCache.set(cacheKey, { at: Date.now(), map: out });
    return out;
  } catch {
    return new Map();
  }
}

/** Sleeper's projected stat line scored with this league's rules. */
export function projectPlayer(
  stats: ProjectionStats | undefined,
  scoringSettings: Record<string, number> | null
): number | null {
  if (!stats || !scoringSettings) return null;

  let total = 0;
  for (const [category, multiplier] of Object.entries(scoringSettings)) {
    const value = stats[category];
    if (!Number.isFinite(value) || !Number.isFinite(multiplier) || multiplier === 0) continue;
    total += value * multiplier;
  }

  // Sleeper renders 0.00 when it publishes a projection row containing no
  // score-bearing categories (for example, an injured player's ADP only).
  return total;
}

/** Team projection = sum of the unrounded native projections for its starters. */
export function projectTeam(
  starters: string[],
  proj: ProjectionMap,
  scoringSettings: Record<string, number> | null
): number | null {
  if (proj.size === 0) return null;
  let total = 0;
  let hits = 0;
  for (const id of starters) {
    const v = projectPlayer(proj.get(id), scoringSettings);
    if (typeof v === "number") {
      total += v;
      hits++;
    }
  }
  // Empty starter slots are normal pre-lock; zero hits means no data.
  return hits === 0 ? null : Math.round(total * 100) / 100;
}

export function uniqueSleeperPlayerIds(ids: string[] | null): string[] {
  return [...new Set((ids ?? []).filter((id) => Boolean(id) && id !== "0"))];
}

// ---------- raw shapes (validated, then discarded) ----------

const zUser = z.object({
  user_id: z.string(),
  username: z.string().nullable(),
  display_name: z.string().nullable(),
});

const zLeague = z.object({
  league_id: z.string(),
  name: z.string(),
  season: z.string(),
  sport: z.string(),
  status: z.string(),
  total_rosters: z.number(),
  roster_positions: z.array(z.string()),
  scoring_settings: z.record(z.string(), z.number()).nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
});

const zRoster = z.object({
  roster_id: z.number(),
  owner_id: z.string().nullable(),
  players: z.array(z.string()).nullable(),
  starters: z.array(z.string()).nullable(),
  reserve: z.array(z.string()).nullable().optional(),
  taxi: z.array(z.string()).nullable().optional(),
  settings: z
    .object({
      wins: z.number().optional(),
      losses: z.number().optional(),
      ties: z.number().optional(),
      fpts: z.number().optional(),
      fpts_decimal: z.number().optional(),
      fpts_against: z.number().optional(),
      fpts_against_decimal: z.number().optional(),
    })
    .nullable(),
});

type SleeperRoster = z.infer<typeof zRoster>;
const ROSTER_CACHE_TTL_MS = 30_000;
const rosterCache = new Map<string, { at: number; promise: Promise<SleeperRoster[]> }>();

async function getLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  const cached = rosterCache.get(leagueId);
  if (cached && Date.now() - cached.at < ROSTER_CACHE_TTL_MS) return cached.promise;

  const request = get<unknown[]>(`/league/${leagueId}/rosters`)
    .then((rows) => rows.map((row) => zRoster.parse(row)))
    .catch((error) => {
      rosterCache.delete(leagueId);
      throw error;
    });
  rosterCache.set(leagueId, { at: Date.now(), promise: request });
  return request;
}

const zLeagueUser = z.object({
  user_id: z.string(),
  display_name: z.string().nullable(),
  avatar: z.string().nullable(),
  metadata: z.object({ team_name: z.string().optional() }).nullable().optional(),
});

const zMatchup = z.object({
  roster_id: z.number(),
  matchup_id: z.number().nullable(),
  points: z.number().nullable(),
  starters: z.array(z.string()).nullable(),
  players: z.array(z.string()).nullable(),
  players_points: z.record(z.string(), z.number()).nullable().optional(),
});

const zTransaction = z.object({
  transaction_id: z.string(),
  type: z.string(),
  status: z.string(),
  leg: z.number().nullable(),
  status_updated: z.number().nullable(),
  roster_ids: z.array(z.number()).nullable(),
  adds: z.record(z.string(), z.number()).nullable(),
  drops: z.record(z.string(), z.number()).nullable(),
});

const zState = z.object({
  week: z.number(),
  season: z.string(),
  season_type: z.string(),
});

/** Sleeper's week counter also advances during the NFL preseason. */
export function currentFantasyWeek(state: z.infer<typeof zState>): number | null {
  return state.season_type === "regular" ? state.week : null;
}

// ---------- helpers ----------

/** Sleeper splits points into integer + decimal-as-hundredths. */
const pts = (whole?: number, dec?: number) => (whole ?? 0) + (dec ?? 0) / 100;

function scoringType(s: Record<string, number> | null): CanonicalLeague["scoringType"] {
  const rec = s?.rec;
  if (rec === 1) return "ppr";
  if (rec === 0.5) return "half_ppr";
  if (rec === 0 || rec === undefined) return "standard";
  return "custom";
}

function slotCounts(positions: string[]): Record<string, number> {
  return positions.reduce<Record<string, number>>((acc, p) => {
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});
}

/**
 * Sleeper's transaction vocabulary is free_agent | waiver | trade |
 * commissioner. Only trade and waiver map by name — the other two are
 * roster moves whose meaning is in the payload, so a free_agent row that
 * only drops somebody is a drop, not an add. An unknown type returns null
 * and the row is skipped rather than written as something the canonical
 * union doesn't allow.
 */
function mapTransactionType(
  type: string,
  hasAdds: boolean,
  hasDrops: boolean
): CanonicalTransaction["type"] | null {
  switch (type) {
    case "trade":
      return "trade";
    case "waiver":
      return "waiver";
    case "free_agent":
    case "commissioner":
      return hasAdds ? "add" : hasDrops ? "drop" : null;
    default:
      return null;
  }
}

function mapStatus(s: string): CanonicalLeague["status"] {
  if (s === "in_season" || s === "post_season") return "in_season";
  if (s === "complete") return "complete";
  return "pre_draft";
}

// ---------- adapter ----------

export const sleeperAdapter: PlatformAdapter = {
  platform: "sleeper",

  getGameState: getSleeperGameState,

  async healthCheck(c) {
    try {
      await get(`/user/${creds(c).username}`);
      return true;
    } catch {
      return false;
    }
  },

  async listLeagues(c, sport: Sport, season: number): Promise<CanonicalLeague[]> {
    const user = zUser.parse(await get(`/user/${creds(c).username}`));
    const raw = await get<unknown[]>(`/user/${user.user_id}/leagues/${sport}/${season}`);
    const state = zState.parse(await get(`/state/${sport}`));

    return raw.map((r) => {
      const l = zLeague.parse(r);
      return {
        externalId: l.league_id,
        sport,
        season: Number(l.season),
        name: l.name,
        teamCount: l.total_rosters,
        scoringType: scoringType(l.scoring_settings),
        // roster_positions is kept in the raw blob because rosterSlots below
        // is a count map and loses ORDER — and order is exactly what resolves
        // Sleeper's positional `starters` array into real slot names.
        // See sync/slots.ts.
        scoringRaw: {
          scoring_settings: l.scoring_settings,
          settings: l.settings,
          roster_positions: l.roster_positions,
        },
        rosterSlots: slotCounts(l.roster_positions),
        currentWeek: currentFantasyWeek(state),
        status: mapStatus(l.status),
        format: sleeperLeagueFormat(l.settings),
        leagueType: sleeperLeagueType(l.settings),
      };
    });
  },

  async getTeams(c, leagueId): Promise<CanonicalTeam[]> {
    const me = zUser.parse(await get(`/user/${creds(c).username}`));
    const rosters = await getLeagueRosters(leagueId);
    const users = (await get<unknown[]>(`/league/${leagueId}/users`)).map((u) =>
      zLeagueUser.parse(u)
    );
    const byId = new Map(users.map((u) => [u.user_id, u]));

    // Annotated: `standing` starts null and is filled in below, so the
    // inferred literal type would otherwise be `null` and reject the write.
    const teams: CanonicalTeam[] = rosters.map((r) => {
      const u = r.owner_id ? byId.get(r.owner_id) : undefined;
      const s = r.settings;
      return {
        externalId: String(r.roster_id),
        name: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`,
        managerName: u?.display_name ?? null,
        avatarUrl: u?.avatar ? `https://sleepercdn.com/avatars/thumbs/${u.avatar}` : null,
        isMine: r.owner_id === me.user_id,
        record: { wins: s?.wins ?? 0, losses: s?.losses ?? 0, ties: s?.ties ?? 0 },
        pointsFor: pts(s?.fpts, s?.fpts_decimal),
        pointsAgainst: pts(s?.fpts_against, s?.fpts_against_decimal),
        standing: null, // derived downstream from record + pointsFor
      };
    });

    // Standings: wins desc, then points for. Sleeper doesn't hand you a rank.
    [...teams]
      .sort((a, b) => b.record.wins - a.record.wins || b.pointsFor - a.pointsFor)
      .forEach((t, i) => (t.standing = i + 1));

    return teams;
  },

  async getRosters(c, leagueId, _season, week): Promise<CanonicalRosterEntry[]> {
    const rosters = await getLeagueRosters(leagueId);

    return rosters.flatMap((r) => {
      const starterIds = new Set<string>();
      const starters = (r.starters ?? []).flatMap((playerId, index) => {
        if (!playerId || playerId === "0" || starterIds.has(playerId)) return [];
        starterIds.add(playerId);
        return [{ playerId, index }];
      });
      const benchIds = new Set<string>();
      const reserveIds = new Set(r.reserve ?? []);
      const taxiIds = new Set(r.taxi ?? []);
      const bench = (r.players ?? []).filter((playerId) => {
        if (
          !playerId ||
          playerId === "0" ||
          starterIds.has(playerId) ||
          reserveIds.has(playerId) ||
          taxiIds.has(playerId) ||
          benchIds.has(playerId)
        ) {
          return false;
        }
        benchIds.add(playerId);
        return true;
      });

      return [
        ...starters.map(({ playerId, index }) => ({
          teamExternalId: String(r.roster_id),
          externalPlayerId: playerId,
          // Sleeper's starters array is positionally ordered against
          // roster_positions minus bench slots. Index → slot name.
          slot: `S${index}`, // resolved to QB/RB/FLEX in the normalizer using rosterSlots
          isStarter: true,
          lineupOrder: index,
          week: week ?? null,
        })),
        ...bench.map((p, index) => ({
          teamExternalId: String(r.roster_id),
          externalPlayerId: p,
          slot: "BN",
          isStarter: false,
          lineupOrder: index,
          week: week ?? null,
        })),
        ...[...(r.reserve ?? [])].map((p, index) => ({
          teamExternalId: String(r.roster_id),
          externalPlayerId: p,
          slot: "IR",
          isStarter: false,
          lineupOrder: index,
          week: week ?? null,
        })),
        ...[...(r.taxi ?? [])].map((p, index) => ({
          teamExternalId: String(r.roster_id),
          externalPlayerId: p,
          slot: "TAXI",
          isStarter: false,
          lineupOrder: index,
          week: week ?? null,
        })),
      ];
    });
  },

  async getMatchups(_c, leagueId, season, week): Promise<CanonicalMatchup[]> {
    const [matchupRows, proj, leagueRow, rosters] = await Promise.all([
      get<unknown[]>(`/league/${leagueId}/matchups/${week}`),
      getProjections(season, week),
      get(`/league/${leagueId}`),
      getLeagueRosters(leagueId),
    ]);
    const raw = matchupRows.map((m) => zMatchup.parse(m));
    const league = zLeague.parse(leagueRow);
    const scoringSettings = league.scoring_settings;
    const format = sleeperLeagueFormat(league.settings);
    const rosterById = new Map(rosters.map((roster) => [roster.roster_id, roster]));

    // Two rows share a matchup_id. Pair them to fill in opponents.
    const byMatchup = new Map<number, typeof raw>();
    for (const m of raw) {
      if (m.matchup_id === null) continue;
      const list = byMatchup.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchup.set(m.matchup_id, list);
    }

    return raw
      .filter((m) => format === "chopped" || m.matchup_id !== null)
      .map((m) => {
        const pair = m.matchup_id === null ? [] : byMatchup.get(m.matchup_id) ?? [];
        const opp = pair.find((x) => x.roster_id !== m.roster_id);
        const orderedStarters = (m.starters ?? []).flatMap((playerId, lineupOrder) =>
          playerId && playerId !== "0" ? [{ playerId, lineupOrder }] : []
        );
        const starters = orderedStarters.map(({ playerId }) => playerId);
        const starterSet = new Set(starters);
        const roster = rosterById.get(m.roster_id);
        const reserveSet = new Set(roster?.reserve ?? []);
        const taxiSet = new Set(roster?.taxi ?? []);
        const bench = uniqueSleeperPlayerIds(m.players).filter(
          (playerId) => !starterSet.has(playerId) && !reserveSet.has(playerId) && !taxiSet.has(playerId)
        );
        const allPlayers = [
          ...orderedStarters.map(({ playerId, lineupOrder }) => ({ playerId, isStarter: true, lineupOrder })),
          ...bench.map((playerId, lineupOrder) => ({ playerId, isStarter: false, lineupOrder })),
          ...[...(roster?.reserve ?? [])].map((playerId, lineupOrder) => ({
            playerId,
            isStarter: false,
            lineupOrder,
          })),
          ...[...(roster?.taxi ?? [])].map((playerId, lineupOrder) => ({
            playerId,
            isStarter: false,
            lineupOrder,
          })),
        ];
        return {
          week,
          matchupKey: format === "chopped"
            ? `${week}-chopped-${m.roster_id}`
            : `${week}-${m.matchup_id}`,
          teamExternalId: String(m.roster_id),
          opponentExternalId: opp ? String(opp.roster_id) : null,
          points: m.points,
          projectedPoints: projectTeam(starters, proj, scoringSettings),
          isFinal: false, // set by the sync job from NFL game state, not Sleeper
          playerStats: allPlayers.map(({ playerId, isStarter, lineupOrder }) => ({
            externalPlayerId: playerId,
            isStarter,
            lineupOrder,
            currentPoints: m.players_points?.[playerId] ?? null,
            projectedPoints: (() => {
              const value = projectPlayer(proj.get(playerId), scoringSettings);
              return value === null ? null : Math.round(value * 100) / 100;
            })(),
          })),
        };
      });
  },

  async getTransactions(_c, leagueId, _season): Promise<CanonicalTransaction[]> {
    const out: CanonicalTransaction[] = [];

    // Transactions are per-week. 18 weeks is cheap and complete.
    for (let week = 1; week <= 18; week++) {
      const raw = (await get<unknown[]>(`/league/${leagueId}/transactions/${week}`)).map((t) =>
        zTransaction.parse(t)
      );

      for (const t of raw) {
        if (t.status !== "complete") continue;

        const adds = Object.entries(t.adds ?? {}).map(([pid, rid]) => ({
          teamExternalId: String(rid),
          externalPlayerId: pid,
        }));
        const drops = Object.entries(t.drops ?? {}).map(([pid, rid]) => ({
          teamExternalId: String(rid),
          externalPlayerId: pid,
        }));

        const type = mapTransactionType(t.type, adds.length > 0, drops.length > 0);
        if (!type) continue;

        out.push({
          externalId: t.transaction_id,
          type,
          week,
          occurredAt: new Date(t.status_updated ?? Date.now()).toISOString(),
          payload: { adds, drops },
        });
      }
    }
    return out;
  },

  // The crosswalk spine. ~5MB — call once daily, cache, never per-request.
  async getPlayerDirectory(sport: Sport): Promise<CanonicalPlayerRef[]> {
    const raw = await get<Record<string, Record<string, unknown>>>(`/players/${sport}`);

    return Object.entries(raw).map(([id, p]) => ({
      externalId: id,
      fullName:
        (p.full_name as string) ??
        [p.first_name, p.last_name].filter(Boolean).join(" ") ??
        id,
      position: (p.position as string) ?? null,
      teamAbbr: (p.team as string) ?? null,
      gsisId: (p.gsis_id as string) ?? null,
      sportradarId: (p.sportradar_id as string) ?? null,
    }));
  },
};
