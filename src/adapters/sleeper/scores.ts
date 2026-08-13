import { z } from "zod";
import type { CanonicalGameState, Sport } from "../types";

const GRAPHQL = "https://sleeper.com/graphql";

const zMetadata = z.object({
  away_team: z.string().nullable().optional(),
  home_team: z.string().nullable().optional(),
  is_over: z.boolean().optional(),
  is_in_progress: z.boolean().optional(),
  canceled: z.boolean().optional(),
  quarter: z.union([z.string(), z.number()]).nullable().optional(),
}).passthrough();

const zScore = z.object({
  game_id: z.string(),
  status: z.string().nullable().optional(),
  start_time: z.union([z.string(), z.number()]).nullable().optional(),
  metadata: zMetadata,
});

const zResponse = z.object({
  data: z.object({ scores: z.array(zScore).nullable() }).nullable(),
  errors: z.array(z.object({ message: z.string() }).passthrough()).optional(),
});

const QUERY = `query Scores($sport: String!, $season: String!, $seasonType: String!, $week: Int!) {
  scores(sport: $sport, season: $season, season_type: $seasonType, week: $week) {
    game_id
    status
    start_time
    metadata
  }
}`;

function isoStartTime(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export function parseScoresResponse(
  payload: unknown,
  sport: Sport,
  season: number,
  week: number,
  seasonType = "regular"
): CanonicalGameState[] {
  const response = zResponse.parse(payload);
  if (response.errors?.length) {
    throw new Error(`sleeper scores: ${response.errors.map((e) => e.message).join("; ")}`);
  }

  return (response.data?.scores ?? []).map((score) => ({
    gameId: score.game_id,
    sport,
    season,
    week,
    seasonType,
    startTime: isoStartTime(score.start_time),
    status: score.status ?? null,
    homeTeam: score.metadata.home_team?.toUpperCase() ?? null,
    awayTeam: score.metadata.away_team?.toUpperCase() ?? null,
    isOver: score.metadata.is_over ?? false,
    inProgress: score.metadata.is_in_progress ?? false,
    canceled: score.metadata.canceled ?? false,
    quarter: score.metadata.quarter == null ? null : String(score.metadata.quarter),
    raw: score.metadata,
  }));
}

export async function getSleeperGameState(
  sport: Sport,
  season: number,
  week: number
): Promise<CanonicalGameState[]> {
  const seasonType = "regular";
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { sport, season: String(season), seasonType, week },
    }),
  });
  if (!res.ok) throw new Error(`sleeper scores ${res.status}`);
  return parseScoresResponse(await res.json(), sport, season, week, seasonType);
}
