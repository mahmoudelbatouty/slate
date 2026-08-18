"use server";

import { createPendingLineupCommand } from "@/lineup/store";

export async function createLineupMovePreviewAction(input: unknown) {
  const command = await createPendingLineupCommand(input);
  return {
    commandId: command.id,
    status: command.status,
    preview: command.preview,
    expiresAt: command.expiresAt,
  };
}
