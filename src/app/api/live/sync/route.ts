import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db/client";
import {
  hasRecentScoreSync,
  IDLE_POLL_MS,
  isLiveSyncWindow,
  LIVE_POLL_MS,
  type LiveGame,
  type SyncRun,
} from "@/lib/live-refresh";
import { runSync, type SyncResult } from "@/sync/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let inFlight: Promise<SyncResult[]> | null = null;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "invalid origin" }, { status: 403 });
  }

  if (!process.env.SLEEPER_USERNAME) {
    return NextResponse.json({ state: "idle", live: false, nextPollMs: IDLE_POLL_MS });
  }

  const client = db();
  const { data: leagues, error: leagueError } = await client
    .from("leagues")
    .select("season, current_week, status")
    .eq("platform", "sleeper")
    .neq("status", "pre_draft");

  if (leagueError) {
    return NextResponse.json({ error: leagueError.message }, { status: 500 });
  }

  const active = leagues ?? [];
  const season = Math.max(...active.map((league) => league.season), 0);
  const week = Math.max(
    ...active.filter((league) => league.season === season).map((league) => league.current_week ?? 0),
    0
  );

  if (!season || !week) {
    return NextResponse.json({ state: "idle", live: false, nextPollMs: IDLE_POLL_MS });
  }

  const { data: games, error: gameError } = await client
    .from("nfl_games")
    .select("start_time, is_over, in_progress, canceled")
    .eq("season", season)
    .eq("week", week);

  if (gameError) {
    return NextResponse.json({ error: gameError.message }, { status: 500 });
  }

  const live = isLiveSyncWindow((games ?? []) as LiveGame[]);
  if (!live) {
    return NextResponse.json({ state: "idle", live: false, nextPollMs: IDLE_POLL_MS });
  }

  const { data: recentRuns, error: runError } = await client
    .from("sync_runs")
    .select("started_at, status, stats")
    .eq("platform", "sleeper")
    .order("started_at", { ascending: false })
    .limit(10);

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  if (hasRecentScoreSync((recentRuns ?? []) as SyncRun[])) {
    return NextResponse.json({ state: "current", live: true, nextPollMs: LIVE_POLL_MS });
  }

  inFlight ??= runSync(client, "live", season).finally(() => {
    inFlight = null;
  });
  const results = await inFlight;
  const failed = results.some((result) => result.status === "error");

  return NextResponse.json(
    {
      state: "synced",
      live: true,
      nextPollMs: LIVE_POLL_MS,
      syncedAt: new Date().toISOString(),
      results,
    },
    { status: failed ? 207 : 200 }
  );
}
