/**
 * Sleeper's `starters` array is positional, not labelled: index 0 is
 * whatever the league's first non-bench roster position is, index 1 the
 * second, and so on. The adapter emits placeholder slots `S0`, `S1`, ...
 * because it has no license to invent names; resolving them is a
 * normalizer job, which is here.
 *
 *   roster_positions: ["QB","RB","RB","WR","WR","TE","FLEX","K","DEF","BN","BN"]
 *   starters[3]  ->  "WR"
 *
 * Note the count map on CanonicalLeague.rosterSlots can't do this — it
 * loses order. The ordered list rides along in leagues.scoring_raw.
 */

/** Slots that are never part of the positional starters array. */
const NON_STARTING = new Set(["BN", "IR", "TAXI"]);

export function startingPositions(rosterPositions: string[]): string[] {
  return rosterPositions.filter((p) => !NON_STARTING.has(p));
}

/**
 * Pull the ordered roster_positions back out of the raw scoring blob.
 * Returns [] when the blob is missing or shaped unexpectedly — callers
 * fall back to the placeholder, which is ugly but never throws.
 */
export function rosterPositionsFromRaw(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const positions = (raw as { roster_positions?: unknown }).roster_positions;
  if (!Array.isArray(positions)) return [];
  return positions.filter((p): p is string => typeof p === "string");
}

/**
 * `S3` -> `WR`. Anything that isn't a placeholder (bench, or an already
 * named slot from another platform) passes through untouched.
 */
export function resolveSlot(slot: string, rosterPositions: string[]): string {
  const match = /^S(\d+)$/.exec(slot);
  if (!match) return slot;

  const index = Number(match[1]);
  const starting = startingPositions(rosterPositions);
  return starting[index] ?? slot;
}
