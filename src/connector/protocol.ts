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

const sleeperEnvelope = z.object({
  version: z.literal(CONNECTOR_VERSION),
  platform: z.literal("sleeper"),
  kind: z.literal("matchup_legs"),
  capturedAt: z.iso.datetime(),
  matchups: z.array(sleeperMatchup).min(1).max(100),
});

const espnPlayer = z.object({
  id: z.string(),
  name: z.string().max(160),
  position: z.string().max(16).nullable(),
  proTeam: z.string().max(16).nullable(),
  lineupSlot: z.string().max(24),
  injuryStatus: z.string().max(32).nullable(),
  currentPoints: z.number().nullable(),
  projectedPoints: z.number().nullable(),
}).strict();

const espnTeam = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string().max(160),
  abbreviation: z.string().max(16).nullable(),
  managerName: z.string().max(160).nullable(),
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  ties: z.number().int().min(0),
  pointsFor: z.number().nullable(),
  pointsAgainst: z.number().nullable(),
  standing: z.number().int().positive().nullable(),
  roster: z.array(espnPlayer).max(100),
}).strict();

const espnMatchup = z.object({
  id: z.string(),
  week: z.number().int().min(1).max(25),
  isFinal: z.boolean(),
  homeTeamId: z.string().regex(/^\d+$/).nullable(),
  awayTeamId: z.string().regex(/^\d+$/).nullable(),
  homePoints: z.number().nullable(),
  awayPoints: z.number().nullable(),
  homeProjected: z.number().nullable(),
  awayProjected: z.number().nullable(),
}).strict();

export const espnLeagueSnapshot = z.object({
  leagueId: z.string().regex(/^\d+$/),
  season: z.number().int().min(2000).max(2100),
  name: z.string().max(200),
  teamCount: z.number().int().min(1).max(32),
  currentWeek: z.number().int().min(1).max(25),
  status: z.enum(["pre_draft", "in_season", "complete"]),
  myTeamId: z.string().regex(/^\d+$/).nullable(),
  rosterSlots: z.record(z.string(), z.number().int().min(0).max(30)),
  teams: z.array(espnTeam).min(1).max(32),
  matchups: z.array(espnMatchup).max(500),
}).strict();
export type EspnLeagueSnapshot = z.infer<typeof espnLeagueSnapshot>;

const espnEnvelope = z.object({
  version: z.literal(CONNECTOR_VERSION),
  platform: z.literal("espn"),
  kind: z.literal("league_snapshot"),
  capturedAt: z.iso.datetime(),
  snapshots: z.array(espnLeagueSnapshot).min(1).max(10),
});

export const connectorEnvelope = z.discriminatedUnion("platform", [
  sleeperEnvelope,
  espnEnvelope,
]);

export type ConnectorEnvelope = z.infer<typeof connectorEnvelope>;

export interface NativeProjection {
  externalLeagueId: string;
  externalTeamId: string;
  week: number;
  projectedPoints: number;
}

/** Platform-shaped data stops here; callers receive canonical projections. */
export function nativeProjections(envelope: ConnectorEnvelope): NativeProjection[] {
  if (envelope.platform !== "sleeper") return [];
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
