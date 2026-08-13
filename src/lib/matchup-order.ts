import type { MatchupCard } from "./matchup";

export const MATCHUP_ORDER_STORAGE_KEY = "slate.matchup-order.v1";

export interface StoredMatchupOrder {
  version: 1;
  keys: string[];
}

export function matchupOrderKey(
  card: Pick<MatchupCard, "platform" | "leagueExternalId">
): string {
  return `${card.platform}:${card.leagueExternalId}`;
}

export function orderMatchupCards(
  cards: MatchupCard[],
  preferredKeys: string[]
): MatchupCard[] {
  const rank = new Map(preferredKeys.map((key, index) => [key, index]));

  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const aRank = rank.get(matchupOrderKey(a.card));
      const bRank = rank.get(matchupOrderKey(b.card));
      if (aRank === undefined && bRank === undefined) return a.index - b.index;
      if (aRank === undefined) return 1;
      if (bRank === undefined) return -1;
      return aRank - bRank;
    })
    .map(({ card }) => card);
}

export function moveMatchupCard(
  cards: MatchupCard[],
  activeKey: string,
  targetKey: string
): MatchupCard[] {
  const from = cards.findIndex((card) => matchupOrderKey(card) === activeKey);
  const to = cards.findIndex((card) => matchupOrderKey(card) === targetKey);
  if (from < 0 || to < 0 || from === to) return cards;

  const next = [...cards];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Replaces only visible-card positions in a saved global order. Leagues absent
 * from a selected week keep their place and return to it when visible again.
 */
export function updatePreferredKeys(
  previousKeys: string[],
  visibleKeys: string[]
): string[] {
  const visible = new Set(visibleKeys);
  let nextVisible = 0;
  const merged = previousKeys.map((key) => {
    if (!visible.has(key)) return key;
    return visibleKeys[nextVisible++];
  });

  const known = new Set(merged);
  for (const key of visibleKeys) {
    if (!known.has(key)) {
      merged.push(key);
      known.add(key);
    }
  }
  return merged;
}

export function parseStoredMatchupOrder(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isStoredMatchupOrder(parsed)) return [];
    return [...new Set(parsed.keys)].slice(0, 500);
  } catch {
    return [];
  }
}

function isStoredMatchupOrder(value: unknown): value is StoredMatchupOrder {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredMatchupOrder>;
  return candidate.version === 1
    && Array.isArray(candidate.keys)
    && candidate.keys.every((key) => typeof key === "string");
}
