import { createHash } from "node:crypto";
import { z } from "zod";

const sha256Pattern = /^[0-9a-f]{64}$/;
export const LINEUP_PREVIEW_TTL_MS = 5 * 60 * 1000;

export const lineupCommandStatusSchema = z.enum([
  "pending",
  "submitted",
  "verified",
  "rejected",
  "expired",
  "unknown",
]);

export const lineupCommandResultSchema = z
  .object({
    providerRequestId: z.string().trim().min(1).max(128).optional(),
    readbackLineupHash: z.string().regex(sha256Pattern).optional(),
    message: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

export const lineupFailureCodeSchema = z.enum([
  "PROVIDER_REJECTED",
  "PROVIDER_UNAVAILABLE",
  "READBACK_MISMATCH",
  "COMMAND_EXPIRED",
]);

export const lineupEntrySchema = z.object({
  externalPlayerId: z.string().trim().min(1).max(128),
  slot: z.string().trim().min(1).max(32).nullable(),
  lineupOrder: z.number().int().min(0),
  isStarter: z.boolean(),
});

export const lineupMoveRequestSchema = z
  .object({
    leagueId: z.string().uuid(),
    teamId: z.string().uuid(),
    week: z.number().int().min(1).max(25),
    externalPlayerId: z.string().trim().min(1).max(128),
    swapWithExternalPlayerId: z.string().trim().min(1).max(128),
  })
  .refine(
    (value) => value.externalPlayerId !== value.swapWithExternalPlayerId,
    {
      message: "A player cannot be swapped with itself",
      path: ["swapWithExternalPlayerId"],
    },
  );

export const lineupMovePreviewSchema = z
  .object({
    platform: z.enum(["sleeper", "espn", "yahoo"]),
    leagueId: z.string().uuid(),
    teamId: z.string().uuid(),
    week: z.number().int().min(1).max(25),
    externalPlayerId: z.string().trim().min(1).max(128),
    playerName: z.string().trim().min(1).max(160),
    swapWithExternalPlayerId: z.string().trim().min(1).max(128),
    swapWithPlayerName: z.string().trim().min(1).max(160),
    fromSlot: z.string().trim().min(1).max(32),
    toSlot: z.string().trim().min(1).max(32),
    expectedLineupHash: z.string().regex(sha256Pattern),
    expiresAt: z.string().datetime({ offset: true }),
    affectedPlayersLocked: z.boolean(),
  })
  .refine((value) => value.fromSlot !== value.toSlot, {
    message: "The destination slot must differ from the current slot",
    path: ["toSlot"],
  });

export type LineupEntry = z.infer<typeof lineupEntrySchema>;
export type LineupMoveRequest = z.infer<typeof lineupMoveRequestSchema>;
export type LineupMovePreview = z.infer<typeof lineupMovePreviewSchema>;
export type LineupCommandStatus = z.infer<typeof lineupCommandStatusSchema>;
export type LineupCommandResult = z.infer<typeof lineupCommandResultSchema>;
export type LineupFailureCode = z.infer<typeof lineupFailureCodeSchema>;

export type LineupCommandErrorCode =
  | "PLAYER_LOCKED"
  | "STALE_LINEUP"
  | "COMMAND_EXPIRED"
  | "PLAYER_NOT_FOUND"
  | "SLOT_UNAVAILABLE";

const allowedTransitions: Record<LineupCommandStatus, LineupCommandStatus[]> = {
  pending: ["submitted", "rejected", "expired", "unknown"],
  submitted: ["verified", "rejected", "unknown"],
  verified: [],
  rejected: [],
  expired: [],
  unknown: [],
};

export function canTransitionLineupCommand(
  from: LineupCommandStatus,
  to: LineupCommandStatus,
): boolean {
  return allowedTransitions[from].includes(to);
}

export class LineupCommandError extends Error {
  constructor(public readonly code: LineupCommandErrorCode, message: string) {
    super(message);
    this.name = "LineupCommandError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function lineupHash(entries: readonly LineupEntry[]): string {
  const canonical = z
    .array(lineupEntrySchema)
    .parse(entries)
    .sort(
      (left, right) =>
        left.lineupOrder - right.lineupOrder ||
        left.externalPlayerId.localeCompare(right.externalPlayerId) ||
        (left.slot ?? "").localeCompare(right.slot ?? ""),
    );

  return sha256(JSON.stringify(canonical));
}

export function lineupMoveIdempotencyKey(
  preview: LineupMovePreview,
): string {
  const command = lineupMovePreviewSchema.parse(preview);
  return sha256(
    JSON.stringify({
      kind: "move_player",
      platform: command.platform,
      leagueId: command.leagueId,
      teamId: command.teamId,
      week: command.week,
      externalPlayerId: command.externalPlayerId,
      swapWithExternalPlayerId: command.swapWithExternalPlayerId,
      fromSlot: command.fromSlot,
      toSlot: command.toSlot,
      expectedLineupHash: command.expectedLineupHash,
      expiresAt: command.expiresAt,
    }),
  );
}

export interface LineupSnapshotEntry extends LineupEntry {
  name: string;
  locked: boolean;
}

export interface LineupSnapshot {
  platform: "sleeper" | "espn" | "yahoo";
  leagueId: string;
  teamId: string;
  week: number;
  entries: LineupSnapshotEntry[];
}

export function gameIsLocked(
  game: {
    startTime: string | null;
    isOver: boolean;
    inProgress: boolean;
    canceled: boolean;
  } | undefined,
  now = new Date(),
): boolean {
  if (!game || game.canceled) return false;
  if (game.isOver || game.inProgress) return true;
  return Boolean(
    game.startTime && new Date(game.startTime).getTime() <= now.getTime(),
  );
}

export function buildLineupMovePreview(
  input: unknown,
  snapshot: LineupSnapshot,
  now = new Date(),
): LineupMovePreview {
  const request = lineupMoveRequestSchema.parse(input);
  if (
    request.leagueId !== snapshot.leagueId ||
    request.teamId !== snapshot.teamId ||
    request.week !== snapshot.week
  ) {
    throw new LineupCommandError(
      "STALE_LINEUP",
      "The requested lineup does not match the current server snapshot",
    );
  }

  const player = snapshot.entries.find(
    (entry) => entry.externalPlayerId === request.externalPlayerId,
  );
  const swapWith = snapshot.entries.find(
    (entry) => entry.externalPlayerId === request.swapWithExternalPlayerId,
  );
  if (!player || !swapWith) {
    throw new LineupCommandError(
      "PLAYER_NOT_FOUND",
      "One or both players are no longer on this roster",
    );
  }
  if (!player.slot || !swapWith.slot || player.slot === swapWith.slot) {
    throw new LineupCommandError(
      "SLOT_UNAVAILABLE",
      "These players do not occupy distinct swappable lineup slots",
    );
  }
  if (player.locked || swapWith.locked) {
    throw new LineupCommandError(
      "PLAYER_LOCKED",
      "One or both players are locked and cannot be moved",
    );
  }

  return lineupMovePreviewSchema.parse({
    platform: snapshot.platform,
    leagueId: snapshot.leagueId,
    teamId: snapshot.teamId,
    week: snapshot.week,
    externalPlayerId: player.externalPlayerId,
    playerName: player.name,
    swapWithExternalPlayerId: swapWith.externalPlayerId,
    swapWithPlayerName: swapWith.name,
    fromSlot: player.slot,
    toSlot: swapWith.slot,
    expectedLineupHash: lineupHash(snapshot.entries),
    expiresAt: new Date(now.getTime() + LINEUP_PREVIEW_TTL_MS).toISOString(),
    affectedPlayersLocked: false,
  });
}

export function validateLineupMoveConfirmation(
  input: unknown,
  currentState: {
    lineupHash: string;
    affectedPlayersLocked: boolean;
  },
  now = new Date(),
): LineupMovePreview {
  const command = lineupMovePreviewSchema.parse(input);

  if (
    !sha256Pattern.test(currentState.lineupHash) ||
    currentState.lineupHash !== command.expectedLineupHash
  ) {
    throw new LineupCommandError(
      "STALE_LINEUP",
      "The provider lineup changed after this preview was created",
    );
  }

  if (command.affectedPlayersLocked || currentState.affectedPlayersLocked) {
    throw new LineupCommandError(
      "PLAYER_LOCKED",
      "This player is locked and cannot be moved",
    );
  }

  if (new Date(command.expiresAt).getTime() <= now.getTime()) {
    throw new LineupCommandError(
      "COMMAND_EXPIRED",
      "This lineup preview expired; refresh the lineup and try again",
    );
  }

  return command;
}
