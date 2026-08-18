/**
 * Canonical shapes the dashboard renders, plus the pure functions that
 * decide order and deep links. No database import here on purpose — this
 * is the half of the dashboard that can be unit tested.
 */

import type { Database } from "@/db/types.gen";
import type { StarterSummary } from "./game-state";
import type { ChoppedSummary, LeagueFormat, LeagueType } from "./league-format";

export type Platform = Database["public"]["Enums"]["platform"];
export type LeagueStatus = "pre_draft" | "in_season" | "complete";

export interface Side {
  teamId: string;
  externalId: string;
  name: string;
  points: number | null;
  projected: number | null;
  lineup?: TeamLineup;
}

export interface MatchupPlayer {
  externalPlayerId: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  slot: string | null;
  isStarter: boolean;
  lineupOrder: number;
  currentPoints: number | null;
  projectedPoints: number | null;
  injuryStatus: string | null;
  game: {
    opponent: string | null;
    startTime: string | null;
    status: string | null;
    isOver: boolean;
    inProgress: boolean;
    canceled: boolean;
    quarter: string | null;
  } | null;
}

export interface TeamLineup {
  starters: MatchupPlayer[];
  bench: MatchupPlayer[];
}

export interface LeagueScoreboardTeam extends Side {
  isMine: boolean;
  starterStatus: StarterSummary;
}

export interface LeagueScoreboardGame {
  key: string;
  left: LeagueScoreboardTeam;
  right: LeagueScoreboardTeam | null;
  isFinal: boolean;
  isLive: boolean;
}

export interface LeagueScoreboardRow {
  matchupKey: string;
  teamId: string;
  opponentTeamId: string | null;
  points: number | null;
  projected: number | null;
  isFinal: boolean;
}

export interface LeagueStanding {
  teamId: string;
  name: string;
  managerName: string | null;
  isMine: boolean;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number | null;
  pointsAgainst: number | null;
  standing: number | null;
}

export interface MatchupCard {
  leagueId: string;
  leagueName: string;
  leagueExternalId: string;
  platform: Platform;
  leagueStatus: LeagueStatus;
  leagueFormat: LeagueFormat;
  leagueType: LeagueType;
  teamCount: number | null;
  season: number;
  week: number;
  isFinal: boolean;
  isLive: boolean;
  winProbability: number | null;
  starterStatus: {
    mine: StarterSummary;
    opponent: StarterSummary | null;
  };
  syncedAt: string | null;
  mine: Side;
  opponent: Side | null;
  chopped: ChoppedSummary | null;
  scoreboard: LeagueScoreboardGame[];
  standings: LeagueStanding[];
}

export function orderLeagueStandings(standings: LeagueStanding[]): LeagueStanding[] {
  return [...standings].sort((a, b) => {
    if (a.standing !== null || b.standing !== null) {
      if (a.standing === null) return 1;
      if (b.standing === null) return -1;
      if (a.standing !== b.standing) return a.standing - b.standing;
    }
    return b.wins - a.wins || (b.pointsFor ?? 0) - (a.pointsFor ?? 0) || a.name.localeCompare(b.name);
  });
}

/** Pair provider rows once, keeping the user's game first and every game truthful. */
export function buildLeagueScoreboard(
  rows: LeagueScoreboardRow[],
  teams: LeagueScoreboardTeam[]
): LeagueScoreboardGame[] {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const rowByTeam = new Map(rows.map((row) => [row.teamId, row]));
  const visited = new Set<string>();
  const games: LeagueScoreboardGame[] = [];

  for (const row of rows) {
    if (visited.has(row.teamId)) continue;
    const team = teamById.get(row.teamId);
    if (!team) continue;

    const opponentRow = row.opponentTeamId ? rowByTeam.get(row.opponentTeamId) : undefined;
    const opponent = opponentRow ? teamById.get(opponentRow.teamId) : undefined;
    visited.add(row.teamId);
    if (opponentRow) visited.add(opponentRow.teamId);

    let left = team;
    let right = opponent ?? null;
    if (right && (right.isMine || (!left.isMine && right.name.localeCompare(left.name) < 0))) {
      [left, right] = [right, left];
    }

    games.push({
      key: row.matchupKey || [row.teamId, opponentRow?.teamId ?? "bye"].sort().join(":"),
      left,
      right,
      isFinal: row.isFinal && (opponentRow?.isFinal ?? true),
      isLive: left.starterStatus.live > 0 || (right?.starterStatus.live ?? 0) > 0,
    });
  }

  return games.sort((a, b) => {
    const aMine = a.left.isMine || Boolean(a.right?.isMine);
    const bMine = b.left.isMine || Boolean(b.right?.isMine);
    if (aMine !== bMine) return aMine ? -1 : 1;
    if (a.isFinal !== b.isFinal) return a.isFinal ? 1 : -1;
    return scoreboardMargin(a) - scoreboardMargin(b) || a.key.localeCompare(b.key);
  });
}

function scoreboardMargin(game: LeagueScoreboardGame): number {
  return Math.abs((game.left.points ?? 0) - (game.right?.points ?? 0));
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
