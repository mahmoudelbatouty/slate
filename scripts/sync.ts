/**
 * Runs a sync from the command line, same code path as the cron route.
 *
 *   npm run sync -- players    # Sleeper directory + crosswalk (do this first)
 *   npm run sync -- daily      # leagues, teams, rosters, transactions
 *   npm run sync -- live       # matchups + scores, current week only
 *   npm run sync -- backfill   # every week 1..current, for the week filter
 *
 * Order matters on a cold database: players, then daily, then backfill.
 */

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const MODES = ["live", "daily", "players", "backfill"] as const;
type Mode = (typeof MODES)[number];

async function main() {
  const arg = process.argv[2] ?? "live";
  if (!MODES.includes(arg as Mode)) {
    throw new Error(`mode must be one of ${MODES.join(", ")}`);
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set in .env.local — nothing can be written yet."
    );
  }

  const season = Number(process.env.DEFAULT_SEASON ?? 2026);

  const { db } = await import("../src/db/client");
  const { runSync } = await import("../src/sync/run");

  const started = Date.now();
  const results = await runSync(db(), arg as Mode, season);

  console.log(JSON.stringify(results, null, 2));
  console.log(`\n${arg} finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (results.some((r) => r.status === "error")) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
