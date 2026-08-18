export const LIVE_SYNC_MIN_GAP_MS = 60_000;
export const LIVE_POLL_MS = 30_000;
export const IDLE_POLL_MS = 5 * 60_000;

const LIVE_LEAD_MS = 15 * 60_000;
const MAX_GAME_WINDOW_MS = 6 * 60 * 60_000;

export interface LiveGame {
  start_time: string | null;
  is_over: boolean;
  in_progress: boolean;
  canceled: boolean;
}

export interface SyncRun {
  platform?: string;
  started_at: string;
  status: string;
  stats: unknown;
}

/**
 * A provider pull is useful shortly before kickoff and until the game is
 * settled. The six-hour ceiling prevents a postponed game from keeping a
 * provider hot forever when its status is stale.
 */
export function isLiveSyncWindow(games: LiveGame[], now = Date.now()): boolean {
  return games.some((game) => {
    if (game.canceled || game.is_over) return false;
    if (game.in_progress) return true;
    if (!game.start_time) return false;

    const start = Date.parse(game.start_time);
    if (!Number.isFinite(start)) return false;
    return now >= start - LIVE_LEAD_MS && now <= start + MAX_GAME_WINDOW_MS;
  });
}

/** A daily/backfill score run is just as fresh as a live run. */
export function isScoreRun(run: SyncRun): boolean {
  if (run.status !== "ok" || !run.stats || typeof run.stats !== "object") return false;
  const stats = run.stats as Record<string, unknown>;
  return typeof stats.matchups === "number" || typeof stats.matchup_weeks === "number";
}

export function hasRecentScoreSync(
  runs: SyncRun[],
  now = Date.now(),
  minimumGapMs = LIVE_SYNC_MIN_GAP_MS
): boolean {
  return runs.some((run) => {
    const started = Date.parse(run.started_at);
    if (!Number.isFinite(started) || now - started >= minimumGapMs) return false;

    // A just-started run may not have stats yet. Treat it as the lease so a
    // second server instance does not launch the same provider work.
    return run.status === "running" || isScoreRun(run);
  });
}

/**
 * Keep the live-score lease provider-specific. One healthy provider must not
 * prevent another connected provider from refreshing its own matchup data.
 */
export function platformsNeedingScoreSync(
  platforms: string[],
  runs: SyncRun[],
  now = Date.now(),
  minimumGapMs = LIVE_SYNC_MIN_GAP_MS
): string[] {
  return platforms.filter((platform) =>
    !hasRecentScoreSync(
      runs.filter((run) => run.platform === platform),
      now,
      minimumGapMs
    )
  );
}
