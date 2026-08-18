import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  LineupCommandError,
  buildLineupMovePreview,
  canTransitionLineupCommand,
  gameIsLocked,
  lineupHash,
  lineupCommandResultSchema,
  lineupMoveIdempotencyKey,
  validateLineupMoveConfirmation,
  type LineupCommandErrorCode,
  type LineupMovePreview,
  type LineupSnapshot,
} from "./command";

const roster = [
  { externalPlayerId: "101", slot: "QB", lineupOrder: 0, isStarter: true },
  { externalPlayerId: "202", slot: "BN", lineupOrder: 1, isStarter: false },
];

function preview(overrides: Partial<LineupMovePreview> = {}): LineupMovePreview {
  return {
    platform: "yahoo",
    leagueId: "4d00d890-4a5b-4f1e-8a35-48d525f7fe11",
    teamId: "c5a1022a-5092-4d58-974a-507f11e56022",
    week: 1,
    externalPlayerId: "202",
    playerName: "Example Player",
    swapWithExternalPlayerId: "101",
    swapWithPlayerName: "Other Player",
    fromSlot: "BN",
    toSlot: "QB",
    expectedLineupHash: lineupHash(roster),
    expiresAt: "2026-09-10T17:05:00.000Z",
    affectedPlayersLocked: false,
    ...overrides,
  };
}

const snapshot: LineupSnapshot = {
  platform: "yahoo",
  leagueId: "4d00d890-4a5b-4f1e-8a35-48d525f7fe11",
  teamId: "c5a1022a-5092-4d58-974a-507f11e56022",
  week: 1,
  entries: [
    { ...roster[0], name: "Other Player", locked: false },
    { ...roster[1], name: "Example Player", locked: false },
  ],
};

describe("lineup command foundation", () => {
  it("hashes the same lineup identically regardless of input row order", () => {
    expect(lineupHash(roster)).toBe(lineupHash([...roster].reverse()));
  });

  it("changes the hash when a player's slot changes", () => {
    expect(lineupHash(roster)).not.toBe(
      lineupHash([{ ...roster[0], slot: "BN" }, roster[1]]),
    );
  });

  it("derives a stable idempotency key and changes it with lineup state", () => {
    const command = preview();
    expect(lineupMoveIdempotencyKey(command)).toBe(
      lineupMoveIdempotencyKey(command),
    );
    expect(lineupMoveIdempotencyKey(command)).not.toBe(
      lineupMoveIdempotencyKey(
        preview({ expectedLineupHash: "a".repeat(64) }),
      ),
    );
  });

  it("builds an exact two-player swap from a server-owned snapshot", () => {
    expect(
      buildLineupMovePreview(
        {
          leagueId: snapshot.leagueId,
          teamId: snapshot.teamId,
          week: snapshot.week,
          externalPlayerId: "202",
          swapWithExternalPlayerId: "101",
        },
        snapshot,
        new Date("2026-09-10T17:00:00.000Z"),
      ),
    ).toMatchObject({
      playerName: "Example Player",
      swapWithPlayerName: "Other Player",
      fromSlot: "BN",
      toSlot: "QB",
      expiresAt: "2026-09-10T17:05:00.000Z",
      affectedPlayersLocked: false,
    });
  });

  it("rejects a preview when either affected player is locked", () => {
    expect(() =>
      buildLineupMovePreview(
        {
          leagueId: snapshot.leagueId,
          teamId: snapshot.teamId,
          week: snapshot.week,
          externalPlayerId: "202",
          swapWithExternalPlayerId: "101",
        },
        {
          ...snapshot,
          entries: snapshot.entries.map((entry) =>
            entry.externalPlayerId === "101"
              ? { ...entry, locked: true }
              : entry,
          ),
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "PLAYER_LOCKED" }));
  });

  it("locks at kickoff but never locks a canceled game", () => {
    const now = new Date("2026-09-10T17:00:00.000Z");
    expect(
      gameIsLocked(
        {
          startTime: "2026-09-10T17:00:00.000Z",
          isOver: false,
          inProgress: false,
          canceled: false,
        },
        now,
      ),
    ).toBe(true);
    expect(
      gameIsLocked(
        {
          startTime: "2026-09-10T16:00:00.000Z",
          isOver: false,
          inProgress: false,
          canceled: true,
        },
        now,
      ),
    ).toBe(false);
  });

  it("allows only forward, terminal command transitions", () => {
    expect(canTransitionLineupCommand("pending", "submitted")).toBe(true);
    expect(canTransitionLineupCommand("submitted", "verified")).toBe(true);
    expect(canTransitionLineupCommand("verified", "submitted")).toBe(false);
    expect(canTransitionLineupCommand("rejected", "pending")).toBe(false);
  });

  it("rejects raw provider data from the sanitized audit result", () => {
    expect(() =>
      lineupCommandResultSchema.parse({
        readbackLineupHash: "a".repeat(64),
        authorization: "must not be stored",
      }),
    ).toThrowError(z.ZodError);
  });

  it("accepts an unlocked, current, unexpired confirmation", () => {
    const command = preview();
    expect(
      validateLineupMoveConfirmation(
        command,
        {
          lineupHash: command.expectedLineupHash,
          affectedPlayersLocked: false,
        },
        new Date("2026-09-10T17:00:00.000Z"),
      ),
    ).toEqual(command);
  });

  it.each<{
    code: LineupCommandErrorCode;
    command: LineupMovePreview;
    currentHash: string;
  } & { currentPlayerLocked?: boolean }>([
    {
      code: "PLAYER_LOCKED",
      command: preview({ affectedPlayersLocked: true }),
      currentHash: lineupHash(roster),
    },
    {
      code: "STALE_LINEUP",
      command: preview(),
      currentHash: "b".repeat(64),
    },
    {
      code: "COMMAND_EXPIRED",
      command: preview(),
      currentHash: lineupHash(roster),
    },
    {
      code: "PLAYER_LOCKED",
      command: preview(),
      currentHash: lineupHash(roster),
      currentPlayerLocked: true,
    },
  ])("rejects $code confirmations", ({
    code,
    command,
    currentHash,
    currentPlayerLocked = false,
  }) => {
    const now =
      code === "COMMAND_EXPIRED"
        ? new Date("2026-09-10T17:06:00.000Z")
        : new Date("2026-09-10T17:00:00.000Z");

    try {
      validateLineupMoveConfirmation(
        command,
        {
          lineupHash: currentHash,
          affectedPlayersLocked: currentPlayerLocked,
        },
        now,
      );
      throw new Error("Expected lineup confirmation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LineupCommandError);
      expect((error as LineupCommandError).code).toBe(code);
    }
  });

  it("rejects a no-op move before a command can be persisted", () => {
    expect(() => preview({ toSlot: "BN" })).not.toThrow();
    expect(() =>
      validateLineupMoveConfirmation(
        preview({ toSlot: "BN" }),
        {
          lineupHash: lineupHash(roster),
          affectedPlayersLocked: false,
        },
      ),
    ).toThrowError(z.ZodError);
  });
});
