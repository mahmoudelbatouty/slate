/**
 * Records real Sleeper responses into fixtures/ so tests never touch the
 * network. Run once; re-run only when you deliberately want to refresh
 * against a schema change.
 *
 *   npx tsx scripts/record-fixtures.ts
 */

import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

config({ path: ".env.local", quiet: true });

const BASE = "https://api.sleeper.app/v1";
const DIR = "fixtures/sleeper";

async function save(name: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  const json = await res.json();
  await writeFile(join(DIR, `${name}.json`), JSON.stringify(json, null, 2));
  console.log(`recorded ${name}.json`);
  return json;
}

async function main() {
  const username = process.env.SLEEPER_USERNAME;
  if (!username) throw new Error("SLEEPER_USERNAME is not set");

  await mkdir(DIR, { recursive: true });

  const user = (await save("user", `/user/${username}`)) as { user_id: string };
  const state = (await save("state", "/state/nfl")) as { season: string; week: number };

  const leagues = (await save(
    "leagues",
    `/user/${user.user_id}/leagues/nfl/${state.season}`
  )) as { league_id: string; status: string }[];

  // Pick an in-season league so matchups have something in them.
  const league = leagues.find((l) => l.status === "in_season") ?? leagues[0];
  if (!league) throw new Error("no leagues to record");

  await save("league", `/league/${league.league_id}`);
  await save("rosters", `/league/${league.league_id}/rosters`);
  await save("users", `/league/${league.league_id}/users`);
  await save("matchups", `/league/${league.league_id}/matchups/${state.week}`);
  await save("transactions", `/league/${league.league_id}/transactions/${state.week}`);

  await writeFile(
    join(DIR, "meta.json"),
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        leagueId: league.league_id,
        season: Number(state.season),
        week: state.week,
        userId: user.user_id,
      },
      null,
      2
    )
  );
  console.log("recorded meta.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
