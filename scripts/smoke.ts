/**
 * Confirms the data path works end to end before you trust any UI.
 *
 *   npx tsx scripts/smoke.ts            # read-only: print leagues
 *   npx tsx scripts/smoke.ts --sync     # also run daily + live into Postgres
 *
 * The read-only form touches Sleeper but not the database, so it works
 * before SUPABASE_SERVICE_ROLE_KEY is set.
 */

import { config } from "dotenv";
import { sleeperAdapter } from "../src/adapters/sleeper";

// Next reads .env.local automatically; a bare tsx process does not.
config({ path: ".env.local", quiet: true });

import type { Credentials } from "../src/adapters/types";

async function main() {
  const username = process.env.SLEEPER_USERNAME;
  if (!username) throw new Error("SLEEPER_USERNAME is not set in .env.local");

  const season = Number(process.env.DEFAULT_SEASON ?? 2026);
  const creds: Credentials = { platform: "sleeper", username };

  const healthy = await sleeperAdapter.healthCheck(creds);
  console.log(`sleeper healthCheck(${username}): ${healthy ? "ok" : "FAILED"}`);
  if (!healthy) process.exit(1);

  const leagues = await sleeperAdapter.listLeagues(creds, "nfl", season);
  console.log(`\n${leagues.length} league(s) for ${season}:`);

  for (const league of leagues) {
    console.log(
      `  ${league.name} — ${league.teamCount} teams, ${league.scoringType}, ` +
        `week ${league.currentWeek}, ${league.status}`
    );

    const teams = await sleeperAdapter.getTeams(creds, league.externalId, season);
    const mine = teams.find((t) => t.isMine);
    console.log(
      mine
        ? `    mine: ${mine.name} (${mine.record.wins}-${mine.record.losses}-${mine.record.ties})`
        : `    mine: no roster matched owner_id — check the username`
    );

    if (league.currentWeek) {
      const matchups = await sleeperAdapter.getMatchups(
        creds,
        league.externalId,
        season,
        league.currentWeek
      );
      const row = mine && matchups.find((m) => m.teamExternalId === mine.externalId);
      if (row) {
        const opponent = matchups.find(
          (m) => m.teamExternalId === row.opponentExternalId
        );
        console.log(
          `    week ${row.week}: ${row.points ?? "—"} (proj ${row.projectedPoints ?? "—"})` +
            ` vs ${opponent?.points ?? "—"}`
        );
      }
    }
  }

  if (!process.argv.includes("--sync")) return;

  const { db } = await import("../src/db/admin");
  const { runSync } = await import("../src/sync/run");

  for (const mode of ["daily", "live"] as const) {
    const results = await runSync(db(), mode, season);
    console.log(`\n${mode}:`, JSON.stringify(results, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
