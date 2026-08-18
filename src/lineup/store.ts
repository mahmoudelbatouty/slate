import "server-only";

import type { Db } from "@/db/admin";
import { db } from "@/db/client";
import type { Database, Json } from "@/db/types.gen";
import { z } from "zod";
import {
  buildLineupMovePreview,
  canTransitionLineupCommand,
  gameIsLocked,
  lineupCommandResultSchema,
  lineupCommandStatusSchema,
  lineupFailureCodeSchema,
  lineupMoveIdempotencyKey,
  lineupMoveRequestSchema,
  type LineupMovePreview,
  type LineupMoveRequest,
  type LineupSnapshot,
  type LineupCommandResult,
  type LineupCommandStatus,
  type LineupFailureCode,
} from "./command";

export interface PendingLineupCommand {
  id: string;
  status: string;
  preview: LineupMovePreview;
  expiresAt: string;
}

export interface LineupCommandTransition {
  commandId: string;
  from: LineupCommandStatus;
  to: LineupCommandStatus;
  result?: LineupCommandResult;
  failureCode?: LineupFailureCode;
}

export async function createPendingLineupCommand(
  input: unknown,
  now = new Date(),
  client: Db = db(),
): Promise<PendingLineupCommand> {
  const request = lineupMoveRequestSchema.parse(input);
  const snapshot = await loadLineupSnapshot(request, now, client);
  const preview = buildLineupMovePreview(request, snapshot, now);
  const idempotencyKey = lineupMoveIdempotencyKey(preview);

  const { error: insertError } = await client.from("lineup_commands").upsert(
    {
      platform: preview.platform,
      league_id: preview.leagueId,
      team_id: preview.teamId,
      week: preview.week,
      external_player_id: preview.externalPlayerId,
      from_slot: preview.fromSlot,
      to_slot: preview.toSlot,
      expected_lineup_hash: preview.expectedLineupHash,
      idempotency_key: idempotencyKey,
      preview: preview as unknown as Json,
      expires_at: preview.expiresAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (insertError) {
    throw new Error(`lineup command create: ${insertError.message}`);
  }

  const { data: command, error: readError } = await client
    .from("lineup_commands")
    .select("id, status, preview, expires_at")
    .eq("idempotency_key", idempotencyKey)
    .single();
  if (readError) throw new Error(`lineup command read: ${readError.message}`);

  return {
    id: command.id,
    status: command.status,
    preview,
    expiresAt: command.expires_at,
  };
}

export async function loadLineupSnapshot(
  input: LineupMoveRequest,
  now = new Date(),
  client: Db = db(),
): Promise<LineupSnapshot> {
  const { data: team, error: teamError } = await client
    .from("teams")
    .select("id, league_id, is_mine")
    .eq("id", input.teamId)
    .maybeSingle();
  if (teamError) throw new Error(`lineup team read: ${teamError.message}`);
  if (!team || !team.is_mine || team.league_id !== input.leagueId) {
    throw new Error("Lineup team is unavailable");
  }

  const [{ data: league, error: leagueError }, { data: roster, error: rosterError }] =
    await Promise.all([
      client
        .from("leagues")
        .select("id, platform, season")
        .eq("id", input.leagueId)
        .maybeSingle(),
      client
        .from("roster_entries")
        .select("external_player_id, player_id, slot, lineup_order, is_starter")
        .eq("team_id", input.teamId)
        .eq("week", input.week),
    ]);
  if (leagueError) throw new Error(`lineup league read: ${leagueError.message}`);
  if (rosterError) throw new Error(`lineup roster read: ${rosterError.message}`);
  if (!league || !roster?.length) throw new Error("Lineup is unavailable");

  const playerIds = [...new Set(roster.flatMap((entry) => entry.player_id ? [entry.player_id] : []))];
  const [{ data: players, error: playerError }, { data: games, error: gameError }] =
    await Promise.all([
      playerIds.length
        ? client
            .from("players")
            .select("id, full_name, team_abbr")
            .in("id", playerIds)
        : Promise.resolve({ data: [], error: null }),
      client
        .from("nfl_games")
        .select("home_team, away_team, start_time, is_over, in_progress, canceled")
        .eq("season", league.season)
        .eq("week", input.week),
    ]);
  if (playerError) throw new Error(`lineup player read: ${playerError.message}`);
  if (gameError) throw new Error(`lineup game read: ${gameError.message}`);

  const playerById = new Map((players ?? []).map((player) => [player.id, player]));
  const gameByTeam = new Map<string, NonNullable<typeof games>[number]>();
  for (const game of games ?? []) {
    if (game.home_team) gameByTeam.set(game.home_team, game);
    if (game.away_team) gameByTeam.set(game.away_team, game);
  }

  return {
    platform: league.platform,
    leagueId: league.id,
    teamId: team.id,
    week: input.week,
    entries: roster.map((entry) => {
      const player = entry.player_id ? playerById.get(entry.player_id) : undefined;
      const game = player?.team_abbr ? gameByTeam.get(player.team_abbr) : undefined;
      return {
        externalPlayerId: entry.external_player_id,
        name: player?.full_name ?? `Player ${entry.external_player_id}`,
        slot: entry.slot,
        lineupOrder: entry.lineup_order,
        isStarter: entry.is_starter,
        locked: gameIsLocked(
          game
            ? {
                startTime: game.start_time,
                isOver: game.is_over,
                inProgress: game.in_progress,
                canceled: game.canceled,
              }
            : undefined,
          now,
        ),
      };
    }),
  };
}

export async function transitionLineupCommand(
  input: LineupCommandTransition,
  now = new Date(),
  client: Db = db(),
): Promise<{ id: string; status: LineupCommandStatus }> {
  const commandId = z.string().uuid().parse(input.commandId);
  const from = lineupCommandStatusSchema.parse(input.from);
  const to = lineupCommandStatusSchema.parse(input.to);
  if (!canTransitionLineupCommand(from, to)) {
    throw new Error(`Unsupported lineup command transition: ${from} -> ${to}`);
  }

  const result = input.result
    ? lineupCommandResultSchema.parse(input.result)
    : undefined;
  const failureCode = input.failureCode
    ? lineupFailureCodeSchema.parse(input.failureCode)
    : undefined;
  if (to === "verified" && !result?.readbackLineupHash) {
    throw new Error("A matching provider read-back is required for verification");
  }
  if ((to === "rejected" || to === "unknown") && !failureCode) {
    throw new Error(`A failure code is required when marking a command ${to}`);
  }

  const update: Database["public"]["Tables"]["lineup_commands"]["Update"] = {
    status: to,
    updated_at: now.toISOString(),
  };
  if (to === "submitted") update.submitted_at = now.toISOString();
  if (to === "verified") update.verified_at = now.toISOString();
  if (result) update.result = result as Json;
  if (failureCode) update.failure_code = failureCode;
  if (to === "expired") update.failure_code = "COMMAND_EXPIRED";

  let query = client
    .from("lineup_commands")
    .update(update)
    .eq("id", commandId)
    .eq("status", from);
  if (from === "pending" && to === "submitted") {
    query = query.gt("expires_at", now.toISOString());
  } else if (to === "expired") {
    query = query.lte("expires_at", now.toISOString());
  }
  if (to === "verified" && result?.readbackLineupHash) {
    query = query.eq("expected_lineup_hash", result.readbackLineupHash);
  }

  const { data: command, error } = await query
    .select("id, status")
    .maybeSingle();
  if (error) throw new Error(`lineup command transition: ${error.message}`);
  if (!command) {
    throw new Error("Lineup command changed state or expired before this update");
  }
  return {
    id: command.id,
    status: lineupCommandStatusSchema.parse(command.status),
  };
}
