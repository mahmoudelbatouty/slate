import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import {
  IDLE_POLL_MS,
  isLiveSyncWindow,
  LIVE_POLL_MS,
  platformsNeedingAccountSync,
  platformsNeedingScoreSync,
  type LiveGame,
  type SyncRun,
} from "@/lib/live-refresh";
import { runSync, type SyncResult } from "@/sync/run";
import type { Platform } from "@/adapters/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let inFlight: Promise<SyncResult[]> | null = null;

const REFRESH_PLATFORMS = new Set<Platform>(["sleeper", "yahoo"]);

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  }

  const client = db();
  const { data: leagues, error: leagueError } = await client
    .from("leagues")
    .select("platform, season, current_week, status")
    .in("platform", [...REFRESH_PLATFORMS]);

  if (leagueError) {
    return NextResponse.json({ error: leagueError.message }, { status: 500 });
  }

  const active = leagues ?? [];
  const season = Math.max(...active.map((league) => league.season), 0);
  const currentSeasonLeagues = active.filter((league) => league.season === season);
  const platforms = [...new Set(
    currentSeasonLeagues.flatMap((league) =>
      REFRESH_PLATFORMS.has(league.platform) ? [league.platform] : []
    )
  )] as Platform[];
  const playableLeagues = currentSeasonLeagues.filter((league) => league.status !== "pre_draft");
  const week = Math.max(
    ...playableLeagues.map((league) => league.current_week ?? 0),
    0
  );

  if (!platforms.length || !season) {
    return NextResponse.json({ state: "idle", live: false, nextPollMs: IDLE_POLL_MS });
  }

  const gamesResult = week
    ? await client
        .from("nfl_games")
        .select("start_time, is_over, in_progress, canceled")
        .eq("season", season)
        .eq("week", week)
    : { data: [], error: null };
  const { data: games, error: gameError } = gamesResult;

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 });
  }

  const live = isLiveSyncWindow((games ?? []) as LiveGame[]);
  const { data: recentRuns, error: runError } = await client
    .from("sync_runs")
    .select("platform, started_at, status, stats")
    .in("platform", platforms)
    .order("started_at", { ascending: false })
    .limit(10 * platforms.length);

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  const runs = (recentRuns ?? []) as SyncRun[];
  const accountPlatforms = platformsNeedingAccountSync(platforms, runs) as Platform[];
  const syncMode = accountPlatforms.length ? "account" : "live";
  const duePlatforms = accountPlatforms.length
    ? accountPlatforms
    : live
      ? platformsNeedingScoreSync(platforms, runs) as Platform[]
      : [];
  if (!duePlatforms.length) {
    return NextResponse.json({
      state: "current",
      live,
      nextPollMs: live ? LIVE_POLL_MS : IDLE_POLL_MS,
    });
  }

  inFlight ??= runSync(client, syncMode, season, duePlatforms).finally(() => {
    inFlight = null;
  });
  const results = await inFlight;
  const failed = results.some((result) => result.status === "error");

  return NextResponse.json(
    {
      state: "synced",
      live,
      mode: syncMode,
      nextPollMs: live ? LIVE_POLL_MS : IDLE_POLL_MS,
      syncedAt: new Date().toISOString(),
      results,
    },
    { status: failed ? 207 : 200 }
  );
}
