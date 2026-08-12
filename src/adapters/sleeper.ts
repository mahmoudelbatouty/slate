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

export type ScoringKey = "pts_ppr" | "pts_half_ppr" | "pts_std";

export function scoringKey(t: CanonicalLeague["scoringType"]): ScoringKey {
  if (t === "ppr") return "pts_ppr";
  if (t === "half_ppr") return "pts_half_ppr";
  return "pts_std"; // 'custom' falls back to std; league-specific math is a later problem
}

/**
 * Weekly projections for every player, keyed by Sleeper player_id.
 * One call covers all your leagues — you just read a different
 * scoring field per league. Cache per (season, week) for ~1h.
 *
 * Returns an empty map on failure rather than throwing: a missing
 * projection should grey out a number, not fail the sync.
 */
export async function getProjections(
  season: number,
  week: number
): Promise<Map<string, Record<ScoringKey, number | null>>> {
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

    const out = new Map<string, Record<ScoringKey, number | null>>();
    for (const r of rows) {
      if (!r.player_id) continue;
      out.set(r.player_id, {
        pts_ppr: r.stats?.pts_ppr ?? null,
        pts_half_ppr: r.stats?.pts_half_ppr ?? null,
        pts_std: r.stats?.pts_std ?? null,
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

/** Team projection = sum of starters' projections in the league's scoring. */
export function projectTeam(
  starters: string[],
  proj: Map<string, Record<ScoringKey, number | null>>,
  key: ScoringKey
): number | null {
  if (proj.size === 0) return null;
  let total = 0;
  let hits = 0;
  for (const id of starters) {
    const v = proj.get(id)?.[key];
    if (typeof v === "number") {
      total += v;
      hits++;
    }
  }
  // Empty starter slots are normal pre-lock; zero hits means no data.
  return hits === 0 ? null : Math.round(total * 100) / 100;
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

const zState = z.object({ week: z.number(), season: z.string() });

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

function mapStatus(s: string): CanonicalLeague["status"] {
  if (s === "in_season" || s === "post_season") return "in_season";
  if (s === "complete") return "complete";
  return "pre_draft";
}

// ---------- adapter ----------

export const sleeperAdapter: PlatformAdapter = {
  platform: "sleeper",

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
        scoringRaw: { scoring_settings: l.scoring_settings, settings: l.settings },
        rosterSlots: slotCounts(l.roster_positions),
        currentWeek: state.week,
        status: mapStatus(l.status),
      };
    });
  },

  async getTeams(c, leagueId): Promise<CanonicalTeam[]> {
    const me = zUser.parse(await get(`/user/${creds(c).username}`));
    const rosters = (await get<unknown[]>(`/league/${leagueId}/rosters`)).map((r) =>
      zRoster.parse(r)
    );
    const users = (await get<unknown[]>(`/league/${leagueId}/users`)).map((u) =>
      zLeagueUser.parse(u)
    );
    const byId = new Map(users.map((u) => [u.user_id, u]));

    const teams = rosters.map((r) => {
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
    const rosters = (await get<unknown[]>(`/league/${leagueId}/rosters`)).map((r) =>
      zRoster.parse(r)
    );

    return rosters.flatMap((r) => {
      const starters = r.starters ?? [];
      const all = r.players ?? [];
      const bench = all.filter((p) => !starters.includes(p));

      return [
        ...starters.map((p, i) => ({
          teamExternalId: String(r.roster_id),
          externalPlayerId: p,
          // Sleeper's starters array is positionally ordered against
          // roster_positions minus bench slots. Index → slot name.
          slot: `S${i}`, // resolved to QB/RB/FLEX in the normalizer using rosterSlots
          isStarter: true,
          week: week ?? null,
        })),
        ...bench.map((p) => ({
          teamExternalId: String(r.roster_id),
          externalPlayerId: p,
          slot: "BN",
          isStarter: false,
          week: week ?? null,
        })),
      ];
    });
  },

  async getMatchups(_c, leagueId, season, week): Promise<CanonicalMatchup[]> {
    const raw = (await get<unknown[]>(`/league/${leagueId}/matchups/${week}`)).map((m) =>
      zMatchup.parse(m)
    );

    // One projections call serves every league — cache this upstream in the
    // sync job so you fetch it once per week, not once per league.
    const proj = await getProjections(season, week);
    const league = zLeague.parse(await get(`/league/${leagueId}`));
    const key = scoringKey(scoringType(league.scoring_settings));

    // Two rows share a matchup_id. Pair them to fill in opponents.
    const byMatchup = new Map<number, typeof raw>();
    for (const m of raw) {
      if (m.matchup_id === null) continue;
      const list = byMatchup.get(m.matchup_id) ?? [];
      list.push(m);
      byMatchup.set(m.matchup_id, list);
    }

    return raw
      .filter((m) => m.matchup_id !== null)
      .map((m) => {
        const pair = byMatchup.get(m.matchup_id!) ?? [];
        const opp = pair.find((x) => x.roster_id !== m.roster_id);
        return {
          week,
          matchupKey: `${week}-${m.matchup_id}`,
          teamExternalId: String(m.roster_id),
          opponentExternalId: opp ? String(opp.roster_id) : null,
          points: m.points,
          projectedPoints: projectTeam(m.starters ?? [], proj, key),
          isFinal: false, // set by the sync job from NFL game state, not Sleeper
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
        out.push({
          externalId: t.transaction_id,
          type: t.type === "free_agent" ? "add" : (t.type as CanonicalTransaction["type"]),
          week,
          occurredAt: new Date(t.status_updated ?? Date.now()).toISOString(),
          payload: {
            adds: Object.entries(t.adds ?? {}).map(([pid, rid]) => ({
              teamExternalId: String(rid),
              externalPlayerId: pid,
            })),
            drops: Object.entries(t.drops ?? {}).map(([pid, rid]) => ({
              teamExternalId: String(rid),
              externalPlayerId: pid,
            })),
          },
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
