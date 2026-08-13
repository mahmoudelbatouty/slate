export interface WeekOption {
  week: number;
  /** True when at least one matchup row has been synced for this week. */
  hasData: boolean;
  /** True for the furthest current week reported by any connected league. */
  isCurrent: boolean;
}

export interface LeagueWeekMetadata {
  currentWeek: number | null;
  scoringRaw?: unknown;
}

export const DEFAULT_FANTASY_WEEKS = 18;
const MAX_REASONABLE_WEEK = 25;

/**
 * Build the complete season rail, not merely the weeks synced so far.
 *
 * Most NFL fantasy seasons expose weeks 1–18. When a provider gives Slate
 * explicit season/playoff settings, use them; a league with a longer range or
 * an already-synced outlying week always wins so real data is never hidden.
 */
export function buildWeekOptions(
  leagues: LeagueWeekMetadata[],
  dataWeeks: number[]
): WeekOption[] {
  const currentWeek = maxValidWeek(leagues.map((league) => league.currentWeek));
  const syncedWeeks = new Set(dataWeeks.filter(isValidWeek));
  const explicitEnds = leagues
    .map((league) => explicitSeasonEndFromRaw(league.scoringRaw))
    .filter((week): week is number => week !== null);
  const fallbackEnd = explicitEnds.length > 0
    ? Math.max(...explicitEnds)
    : DEFAULT_FANTASY_WEEKS;
  const endWeek = Math.max(
    fallbackEnd,
    currentWeek ?? 0,
    maxValidWeek(dataWeeks) ?? 0
  );

  return Array.from({ length: endWeek }, (_, index) => {
    const week = index + 1;
    return {
      week,
      hasData: syncedWeeks.has(week),
      isCurrent: week === currentWeek,
    };
  });
}

/** Provider-defined final matchup week, with the normal NFL season fallback. */
export function seasonEndWeek(scoringRaw: unknown): number {
  return explicitSeasonEndFromRaw(scoringRaw) ?? DEFAULT_FANTASY_WEEKS;
}

/**
 * Clamp a user-editable/shareable URL week to the season rail.
 * In preseason there is no default selected week, but any valid requested
 * season week remains selectable so its unsynced state can be explained.
 */
export function resolveWeek(
  requested: number | undefined,
  available: number[],
  currentWeek: number | null
): number | null {
  if (requested !== undefined && available.includes(requested)) return requested;
  return currentWeek;
}

function explicitSeasonEndFromRaw(raw: unknown): number | null {
  if (!isRecord(raw)) return null;
  const settings = isRecord(raw.settings) ? raw.settings : raw;

  const direct = firstValidWeek(
    settings.season_end_week,
    settings.playoff_end_week,
    settings.total_weeks,
    settings.matchup_period_count
  );
  if (direct !== null) return direct;

  const playoffStart = validWeek(settings.playoff_week_start);
  const regularSeasonEnd = validWeek(settings.regular_season_matchup_period_count);
  const playoffTeams = positiveInteger(settings.playoff_teams);
  if (regularSeasonEnd !== null && playoffTeams !== null && playoffTeams > 1) {
    const rounds = Math.ceil(Math.log2(playoffTeams));
    return Math.min(regularSeasonEnd + rounds, MAX_REASONABLE_WEEK);
  }
  if (playoffStart !== null && playoffTeams !== null && playoffTeams > 1) {
    const rounds = Math.ceil(Math.log2(playoffTeams));
    return Math.min(playoffStart + rounds - 1, MAX_REASONABLE_WEEK);
  }

  return null;
}

function firstValidWeek(...values: unknown[]): number | null {
  for (const value of values) {
    const week = validWeek(value);
    if (week !== null) return week;
  }
  return null;
}

function maxValidWeek(values: Array<number | null>): number | null {
  const valid = values.filter((week): week is number => isValidWeek(week));
  return valid.length > 0 ? Math.max(...valid) : null;
}

function validWeek(value: unknown): number | null {
  return isValidWeek(value) ? value : null;
}

function isValidWeek(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_REASONABLE_WEEK;
}

function positiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
