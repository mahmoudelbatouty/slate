import { createHash } from "node:crypto";
import { z } from "zod";

const sha256Pattern = /^[0-9a-f]{64}$/;

export const lineupCommandStatusSchema = z.enum([
  "pending",
  "submitted",
  "verified",
  "rejected",
  "expired",
  "unknown",
]);

export const lineupEntrySchema = z.object({
  externalPlayerId: z.string().trim().min(1).max(128),
  slot: z.string().trim().min(1).max(32),
  lineupOrder: z.number().int().min(0),
  isStarter: z.boolean(),
});

export const lineupMovePreviewSchema = z
  .object({
    platform: z.enum(["sleeper", "espn", "yahoo"]),
    leagueId: z.string().uuid(),
    teamId: z.string().uuid(),
    week: z.number().int().min(1).max(25),
    externalPlayerId: z.string().trim().min(1).max(128),
    playerName: z.string().trim().min(1).max(160),
    fromSlot: z.string().trim().min(1).max(32),
    toSlot: z.string().trim().min(1).max(32),
    expectedLineupHash: z.string().regex(sha256Pattern),
    expiresAt: z.string().datetime({ offset: true }),
    playerLocked: z.boolean(),
  })
  .refine((value) => value.fromSlot !== value.toSlot, {
    message: "The destination slot must differ from the current slot",
    path: ["toSlot"],
  });

export type LineupEntry = z.infer<typeof lineupEntrySchema>;
export type LineupMovePreview = z.infer<typeof lineupMovePreviewSchema>;
export type LineupCommandStatus = z.infer<typeof lineupCommandStatusSchema>;

export type LineupCommandErrorCode =
  | "PLAYER_LOCKED"
  | "STALE_LINEUP"
  | "COMMAND_EXPIRED";

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
        left.slot.localeCompare(right.slot),
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
      fromSlot: command.fromSlot,
      toSlot: command.toSlot,
      expectedLineupHash: command.expectedLineupHash,
    }),
  );
}

export function validateLineupMoveConfirmation(
  input: unknown,
  currentState: {
    lineupHash: string;
    playerLocked: boolean;
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

  if (command.playerLocked || currentState.playerLocked) {
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
