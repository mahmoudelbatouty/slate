import "server-only";

import { db } from "@/db/admin";

/**
 * One-time prototype migration. The project had no Auth users when ownership
 * was introduced, so the first (and only) account may safely claim the cached
 * data. Once a second Auth user exists this path permanently becomes a no-op.
 */
export async function claimLegacyDataForSoleUser(ownerId: string): Promise<void> {
  const client = db();
  const { data: users, error: usersError } = await client.auth.admin.listUsers({ page: 1, perPage: 2 });
  if (usersError || users.users.length !== 1 || users.users[0]?.id !== ownerId) return;

  const tables = [
    "platform_accounts",
    "leagues",
    "sync_runs",
    "connector_installations",
    "connector_pairing_challenges",
    "native_projections",
  ] as const;

  for (const table of tables) {
    const { error } = await client.from(table).update({ owner_id: ownerId }).is("owner_id", null);
    if (error) throw new Error(`legacy ${table} ownership: ${error.message}`);
  }
}
