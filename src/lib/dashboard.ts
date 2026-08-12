import "server-only";
import { db, dbConfigured } from "@/db/client";
import { byDrama, resolveWeek, type MatchupCard } from "./matchup";

export interface WeekOption {
  week: number;
  /** False when nothing has been synced for this week yet. */
  hasData: boolean;
  isCurrent: boolean;
}

export interface Dashboard {
  configured: boolean;
  cards: MatchupCard[];
  lastSyncedAt: string | null;
  leagueCount: number;
  /** The week actually being shown, after clamping whatever was asked for. */
  week: number | null;
  weeks: WeekOption[];
}

const EMPTY: Dashboard = {
  configured: false,
  cards: [],
  lastSyncedAt: null,
  leagueCount: 0,
  week: null,
  weeks: [],
};

/**
 * Reads Postgres and nothing else. No platform API is reachable from a
 * page render — that constraint is what keeps this fast and keeps it
 * standing when a platform breaks.
 *
 * `requestedWeek` comes from the URL and is clamped to something real, so
 * a hand-typed ?week=99 shows the current week rather than an error.
 */
export async function getDashboard(requestedWeek?: number): Promise<Dashboard> {
  if (!dbConfigured()) return EMPTY;

  const client = db();

  const { data: leagues, error } = await client
    .from("leagues")
    .select("id, name, external_id, platform, season, current_week, synced_at");

  if (error) throw new Error(`leagues read: ${error.message}`);
  if (!leagues?.length) return { ...EMPTY, configured: true };

  // Leagues can disagree about the current week (different platforms, or
  // one league already eliminated). The furthest-along wins for defaults.
  const currentWeek = Math.max(...leagues.map((l) => l.current_week ?? 0), 0) || null;

  // Whole weeks rather than just my own row, deliberately: M5's
  // whole-league toggle needs exactly this data and it's a few dozen rows.
  const { data: rows, error: matchupError } = await client
    .from("matchups")
    .select("league_id, week, points, projected_points, is_final, team_id, opponent_team_id")
    .in(
      "league_id",
      leagues.map((l) => l.id)
    );

  if (matchupError) throw new Error(`matchups read: ${matchupError.message}`);

  const { data: teams, error: teamError } = await client
    .from("teams")
    .select("id, league_id, name, external_id, is_mine");

  if (teamError) throw new Error(`teams read: ${teamError.message}`);

  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));
  const rowByTeam = new Map((rows ?? []).map((r) => [`${r.week}:${r.team_id}`, r]));

  // Every week up to now is selectable, whether or not it's been synced —
  // an unsynced week shows an empty state rather than vanishing from the
  // filter, because "nothing here yet" is the useful answer.
  const weeksWithData = new Set((rows ?? []).map((r) => r.week));
  const weeks: WeekOption[] = currentWeek
    ? Array.from({ length: currentWeek }, (_, i) => i + 1).map((week) => ({
        week,
        hasData: weeksWithData.has(week),
        isCurrent: week === currentWeek,
      }))
    : [];

  const week = resolveWeek(
    requestedWeek,
    weeks.map((w) => w.week),
    currentWeek
  );

  const cards: MatchupCard[] = [];

  for (const league of leagues) {
    if (!week) continue;

    const mineRow = (rows ?? []).find(
      (r) =>
        r.league_id === league.id &&
        r.week === week &&
        teamById.get(r.team_id)?.is_mine
    );
    if (!mineRow) continue;

    const mineTeam = teamById.get(mineRow.team_id);
    if (!mineTeam) continue;

    const oppTeam = mineRow.opponent_team_id
      ? teamById.get(mineRow.opponent_team_id)
      : undefined;
    const oppRow = mineRow.opponent_team_id
      ? rowByTeam.get(`${week}:${mineRow.opponent_team_id}`)
      : undefined;

    cards.push({
      leagueId: league.id,
      leagueName: league.name,
      leagueExternalId: league.external_id,
      platform: league.platform,
      season: league.season,
      week,
      isFinal: mineRow.is_final,
      syncedAt: league.synced_at,
      mine: {
        teamId: mineTeam.id,
        externalId: mineTeam.external_id,
        name: mineTeam.name ?? "My team",
        points: mineRow.points,
        projected: mineRow.projected_points,
      },
      opponent:
        oppTeam && oppRow
          ? {
              teamId: oppTeam.id,
              externalId: oppTeam.external_id,
              name: oppTeam.name ?? "Opponent",
              points: oppRow.points,
              projected: oppRow.projected_points,
            }
          : null,
    });
  }

  cards.sort(byDrama);

  const syncTimes = leagues
    .map((l) => l.synced_at)
    .filter((s): s is string => Boolean(s))
    .sort();

  return {
    configured: true,
    cards,
    lastSyncedAt: syncTimes.at(-1) ?? null,
    leagueCount: leagues.length,
    week,
    weeks,
  };
}
