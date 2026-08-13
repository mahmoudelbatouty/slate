import { z } from "zod";

export const CONNECTOR_VERSION = 1 as const;

const sleeperMatchup = z.object({
  league_id: z.string(),
  round: z.number().int().min(1).max(25),
  roster_id: z.number().int().positive(),
  matchup_id: z.number().int().nullable().optional(),
  points: z.number().nullable().optional(),
  proj_points: z.number().nullable(),
  starters: z.array(z.string()).optional(),
  player_map: z.record(z.string(), z.number()).nullable().optional(),
});

export const connectorEnvelope = z.object({
  version: z.literal(CONNECTOR_VERSION),
  platform: z.literal("sleeper"),
  kind: z.literal("matchup_legs"),
  capturedAt: z.iso.datetime(),
  matchups: z.array(sleeperMatchup).min(1).max(100),
});

export type ConnectorEnvelope = z.infer<typeof connectorEnvelope>;

export interface NativeProjection {
  externalLeagueId: string;
  externalTeamId: string;
  week: number;
  projectedPoints: number;
}

/** Platform-shaped data stops here; callers receive canonical projections. */
export function nativeProjections(envelope: ConnectorEnvelope): NativeProjection[] {
  return envelope.matchups.flatMap((row) =>
    typeof row.proj_points === "number"
      ? [{
          externalLeagueId: row.league_id,
          externalTeamId: String(row.roster_id),
          week: row.round,
          projectedPoints: Math.round(row.proj_points * 100) / 100,
        }]
      : []
  );
}
