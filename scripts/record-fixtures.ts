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
const GRAPHQL = "https://sleeper.com/graphql";
const DIR = "fixtures/sleeper";

async function save(name: string, path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  const json = await res.json();
  await writeFile(join(DIR, `${name}.json`), JSON.stringify(json, null, 2));
  console.log(`recorded ${name}.json`);
  return json;
}

async function saveScores(season: number, week: number) {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      query: `query Scores($season: String!, $week: Int!) {
        scores(sport: "nfl", season: $season, season_type: "regular", week: $week) {
          game_id
          status
          start_time
          metadata
        }
      }`,
      variables: { season: String(season), week },
    }),
  });
  if (!res.ok) throw new Error(`scores -> ${res.status}`);
  const json = await res.json();
  await writeFile(join(DIR, "scores.json"), JSON.stringify(json, null, 2));
  console.log("recorded scores.json");
}

async function main() {
  await mkdir(DIR, { recursive: true });

  if (process.argv.includes("--scores-only")) {
    await saveScores(2025, 11);
    return;
  }

  const username = process.env.SLEEPER_USERNAME;
  if (!username) throw new Error("SLEEPER_USERNAME is not set");

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
  await saveScores(Number(state.season), state.week);

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
