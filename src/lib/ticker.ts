import type { MatchupCard } from "./matchup";
import { matchupOrderKey } from "./matchup-order";

/**
 * The header ticker. Every league gets exactly one item, including the ones
 * with nothing to score this week — a league that vanishes from the strip
 * reads as a sync failure rather than a bye.
 */
export interface TickerItem {
  key: string;
  /** DOM id of the card this item scrolls to. */
  target: string;
  home: string;
  score: string;
  away: string;
  isMine: boolean;
}

export function cardAnchorId(card: Pick<MatchupCard, "platform" | "leagueExternalId">): string {
  return `card-${matchupOrderKey(card).replace(/[^a-z0-9]+/gi, "-")}`;
}

export function buildTickerItems(cards: MatchupCard[]): TickerItem[] {
  return cards.map((card) => ({
    key: matchupOrderKey(card),
    target: cardAnchorId(card),
    ...content(card),
  }));
}

function content(card: MatchupCard): Pick<TickerItem, "home" | "score" | "away" | "isMine"> {
  if (card.leagueStatus === "pre_draft") {
    return { home: card.leagueName, score: "PRE-DRAFT", away: "no scores yet", isMine: false };
  }
  if (card.leagueFormat === "chopped") {
    const projected = card.chopped?.standings.find((team) => team.isMine)?.projected;
    return {
      home: card.mine.name,
      score: projected === null || projected === undefined ? "SURVIVAL" : `${projected.toFixed(1)} proj`,
      away: `RANK ${card.chopped?.myRank ?? "—"}`,
      isMine: true,
    };
  }
  if (!card.opponent) {
    return { home: card.leagueName, score: "BYE WEEK", away: "no game", isMine: false };
  }
  return {
    home: card.mine.name,
    score: `${points(card.mine.points)} – ${points(card.opponent.points)}`,
    away: card.opponent.name,
    isMine: true,
  };
}

function points(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}
