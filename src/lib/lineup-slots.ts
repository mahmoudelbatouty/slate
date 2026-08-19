import { startingPositions } from "@/sync/slots";
import type { MatchupPlayer } from "./matchup";

/**
 * Restores the gaps in a starting lineup.
 *
 * Sleeper's `starters` array is positional and uses `"0"` for a slot the
 * manager left empty. The adapter drops those, which is right for scoring and
 * wrong for display: a roster with `[QB, RB, RB, WR, WR, TE, FLEX, 0, 0,
 * SUPER_FLEX]` came back as eight players, so the card showed eight rows where
 * Sleeper shows ten — two of them holes the manager still has to fill.
 *
 * The stored `lineupOrder` is the provider's own index, so the gaps are
 * recoverable from the league's ordered roster positions. Anything that
 * doesn't line up cleanly is left alone rather than guessed at.
 */
export function fillEmptyStarterSlots(
  starters: MatchupPlayer[],
  rosterPositions: string[]
): MatchupPlayer[] {
  if (starters.length === 0) return starters;

  const slots = startingPositions(rosterPositions);
  if (slots.length <= starters.length) return starters;

  const taken = new Set<number>();
  for (const starter of starters) {
    if (!Number.isInteger(starter.lineupOrder)) return starters;
    if (starter.lineupOrder < 0 || starter.lineupOrder >= slots.length) return starters;
    if (taken.has(starter.lineupOrder)) return starters;
    taken.add(starter.lineupOrder);
  }

  const filled = [...starters];
  for (let index = 0; index < slots.length; index++) {
    if (taken.has(index)) continue;
    filled.push(emptySlot(slots[index], index));
  }

  return filled.sort((a, b) => a.lineupOrder - b.lineupOrder);
}

function emptySlot(slot: string, lineupOrder: number): MatchupPlayer {
  return {
    externalPlayerId: `empty-${lineupOrder}`,
    isEmptySlot: true,
    name: "Empty",
    position: null,
    nflTeam: null,
    slot,
    isStarter: true,
    lineupOrder,
    currentPoints: null,
    projectedPoints: null,
    injuryStatus: null,
    game: null,
  };
}
