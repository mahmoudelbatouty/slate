/**
 * Player ID crosswalk.
 *
 * Sleeper's directory is the canonical `players` table; every other
 * platform's IDs map into it. The tiers come straight from the strategy
 * note in adapters/types.ts:
 *
 *   1. gsis_id / sportradar_id exact          -> 1.0
 *   2. normalized name + position + team      -> 0.9
 *   3. normalized name + position             -> 0.7
 *   4. no match: leave player_id NULL and surface it in /admin/unmatched
 *
 * There are maybe 20 unmatched a season and they're mostly defenses and
 * Jr./Sr. suffixes, so this deliberately stops at exact-ish matching.
 * No Levenshtein, no scoring model.
 */

import type { CanonicalPlayerRef } from "@/adapters/types";

export const MIN_CONFIDENCE = 0.7;

/** Strip accents, punctuation, suffixes, and case: "A.J. Brown Jr." -> "ajbrown". */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export interface CanonicalPlayerRow {
  id: string;
  full_name: string;
  position: string | null;
  team_abbr: string | null;
  gsis_id: string | null;
  sportradar_id: string | null;
}

export interface Match {
  playerId: string;
  confidence: number;
}

/**
 * Index built once per crosswalk run, then queried per incoming player.
 * Keeping it in memory beats N round trips to Postgres by a wide margin —
 * the player table is ~11k rows.
 */
export class CrosswalkIndex {
  private byGsis = new Map<string, string>();
  private bySportradar = new Map<string, string>();
  private byNamePosTeam = new Map<string, string[]>();
  private byNamePos = new Map<string, string[]>();

  constructor(rows: CanonicalPlayerRow[]) {
    for (const row of rows) {
      if (row.gsis_id) this.byGsis.set(row.gsis_id, row.id);
      if (row.sportradar_id) this.bySportradar.set(row.sportradar_id, row.id);

      const name = normalizeName(row.full_name);
      const pos = (row.position ?? "").toUpperCase();
      const team = (row.team_abbr ?? "").toUpperCase();

      push(this.byNamePosTeam, `${name}|${pos}|${team}`, row.id);
      push(this.byNamePos, `${name}|${pos}`, row.id);
    }
  }

  match(ref: CanonicalPlayerRef): Match | null {
    if (ref.gsisId) {
      const hit = this.byGsis.get(ref.gsisId);
      if (hit) return { playerId: hit, confidence: 1.0 };
    }
    if (ref.sportradarId) {
      const hit = this.bySportradar.get(ref.sportradarId);
      if (hit) return { playerId: hit, confidence: 1.0 };
    }

    const name = normalizeName(ref.fullName);
    const pos = (ref.position ?? "").toUpperCase();
    const team = (ref.teamAbbr ?? "").toUpperCase();

    // Ambiguous buckets are treated as no match. Two active players with
    // the same normalized name and position is exactly the case a human
    // should look at, not one a coin flip should decide.
    const exact = this.byNamePosTeam.get(`${name}|${pos}|${team}`);
    if (exact?.length === 1) return { playerId: exact[0], confidence: 0.9 };

    const loose = this.byNamePos.get(`${name}|${pos}`);
    if (loose?.length === 1) return { playerId: loose[0], confidence: 0.7 };

    return null;
  }
}

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
