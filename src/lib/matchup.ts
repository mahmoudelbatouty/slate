/**
 * Canonical shapes the dashboard renders, plus the pure functions that
 * decide order and deep links. No database import here on purpose — this
 * is the half of the dashboard that can be unit tested.
 */

import type { Database } from "@/db/types.gen";

export type Platform = Database["public"]["Enums"]["platform"];
export type LeagueStatus = "pre_draft" | "in_season" | "complete";

export interface Side {
  teamId: string;
  externalId: string;
  name: string;
  points: number | null;
  projected: number | null;
}

export interface MatchupCard {
  leagueId: string;
  leagueName: string;
  leagueExternalId: string;
  platform: Platform;
  leagueStatus: LeagueStatus;
  teamCount: number | null;
  season: number;
  week: number;
  isFinal: boolean;
  isLive: boolean;
  winProbability: number | null;
  remaining: number;
  syncedAt: string | null;
  mine: Side;
  opponent: Side | null;
}

/** SL / ES / YH — provenance without spending any of the color budget. */
export const MONOGRAM: Record<Platform, string> = {
  sleeper: "SL",
  espn: "ES",
  yahoo: "YH",
};

/** Provider fallback when an inline action is unavailable or unverified. */
export function deepLink(card: MatchupCard): { href: string; label: string } {
  switch (card.platform) {
    case "sleeper":
      return {
        href: card.leagueStatus === "pre_draft"
          ? `https://sleeper.com/leagues/${card.leagueExternalId}`
          : `https://sleeper.com/leagues/${card.leagueExternalId}/team`,
        label: "Open in Sleeper",
      };
    case "espn":
      return {
        href: card.leagueStatus === "pre_draft"
          ? `https://fantasy.espn.com/football/league?leagueId=${card.leagueExternalId}`
          : `https://fantasy.espn.com/football/team?leagueId=${card.leagueExternalId}` +
            `&teamId=${card.mine.externalId}&seasonId=${card.season}`,
        label: "Open in ESPN",
      };
    case "yahoo":
      return {
        href: card.leagueStatus === "pre_draft"
          ? `https://football.fantasysports.yahoo.com/f1/${card.leagueExternalId}`
          : `https://football.fantasysports.yahoo.com/f1/${card.leagueExternalId}/${card.mine.externalId}`,
        label: "Open in Yahoo",
      };
  }
}

export function margin(card: MatchupCard): number {
  const mine = card.mine.points ?? 0;
  const theirs = card.opponent?.points ?? 0;
  return Math.abs(mine - theirs);
}

/**
 * Ordered by drama, not alphabetically: unfinished games first, then
 * closest margin. A blowout you already won doesn't need to be at the top.
 */
export function byDrama(a: MatchupCard, b: MatchupCard): number {
  if (a.leagueStatus === "pre_draft" && b.leagueStatus !== "pre_draft") return 1;
  if (a.leagueStatus !== "pre_draft" && b.leagueStatus === "pre_draft") return -1;
  if (a.isFinal !== b.isFinal) return a.isFinal ? 1 : -1;
  return margin(a) - margin(b);
}
