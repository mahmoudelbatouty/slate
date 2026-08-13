import "server-only";
import { db, dbConfigured } from "@/db/client";
import { byDrama, type MatchupCard, type MatchupPlayer, type TeamLineup } from "./matchup";
import { buildWeekOptions, resolveWeek, type WeekOption } from "./weeks";
import {
  EMPTY_STARTER_SUMMARY,
  summarizeStarterStates,
  winProbability,
  type StarterGame,
} from "./game-state";

export type { WeekOption } from "./weeks";

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
  weeks: buildWeekOptions([], []),
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
    .select("id, name, external_id, platform, season, current_week, synced_at, status, team_count, scoring_raw");

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

  const { data: nativeRows, error: nativeError } = await client
    .from("native_projections")
    .select("platform, external_league_id, external_team_id, week, projected_points")
    .in(
      "external_league_id",
      leagues.map((league) => league.external_id)
    );
  if (nativeError) throw new Error(`native projections read: ${nativeError.message}`);
  const nativeByTeam = new Map(
    (nativeRows ?? []).map((row) => [
      `${row.platform}:${row.external_league_id}:${row.external_team_id}:${row.week}`,
      row.projected_points,
    ])
  );

  // The full season remains selectable, including future/unsynced weeks and
  // preseason. Provider settings can narrow or extend the normal 18-week rail.
  const weeks = buildWeekOptions(
    leagues.map((league) => ({
      currentWeek: league.current_week,
      scoringRaw: league.scoring_raw,
    })),
    (rows ?? []).map((row) => row.week)
  );

  const week = resolveWeek(
    requestedWeek,
    weeks.map((w) => w.week),
    currentWeek
  );

  const selectedRows = (rows ?? []).filter((row) => row.week === week);
  const relevantTeamIds = new Set<string>();
  for (const row of selectedRows) {
    if (teamById.get(row.team_id)?.is_mine) {
      relevantTeamIds.add(row.team_id);
      if (row.opponent_team_id) relevantTeamIds.add(row.opponent_team_id);
    }
  }

  const lineupsByTeam = new Map<string, TeamLineup>();
  if (week && relevantTeamIds.size > 0) {
    const { data: entries, error: entryError } = await client
      .from("roster_entries")
      .select("team_id, player_id, external_player_id, slot, is_starter, current_points, projected_points")
      .eq("week", week)
      .in("team_id", [...relevantTeamIds]);
    if (entryError) throw new Error(`lineup read: ${entryError.message}`);

    const playerIds = [...new Set((entries ?? []).flatMap((entry) => entry.player_id ? [entry.player_id] : []))];
    const seasons = [...new Set(leagues.map((league) => league.season))];
    const [{ data: playerRows, error: playerError }, { data: gameRows, error: gameDetailError }] =
      await Promise.all([
        playerIds.length
          ? client.from("players").select("id, full_name, position, team_abbr, status").in("id", playerIds)
          : Promise.resolve({ data: [], error: null }),
        client
          .from("nfl_games")
          .select("season, home_team, away_team, start_time, status, is_over, in_progress, canceled, quarter")
          .eq("week", week)
          .in("season", seasons),
      ]);
    if (playerError) throw new Error(`lineup player read: ${playerError.message}`);
    if (gameDetailError) throw new Error(`lineup game read: ${gameDetailError.message}`);

    const playerById = new Map((playerRows ?? []).map((player) => [player.id, player]));
    const seasonByTeam = new Map(teams?.map((team) => [
      team.id,
      leagues.find((league) => league.id === team.league_id)?.season ?? null,
    ]) ?? []);
    const gameByTeam = new Map<string, NonNullable<typeof gameRows>[number]>();
    for (const game of gameRows ?? []) {
      if (game.home_team) gameByTeam.set(`${game.season}:${game.home_team}`, game);
      if (game.away_team) gameByTeam.set(`${game.season}:${game.away_team}`, game);
    }

    for (const entry of entries ?? []) {
      const player = entry.player_id ? playerById.get(entry.player_id) : undefined;
      const season = seasonByTeam.get(entry.team_id);
      const game = player?.team_abbr && season
        ? gameByTeam.get(`${season}:${player.team_abbr}`)
        : undefined;
      const opponent = game && player?.team_abbr
        ? (game.home_team === player.team_abbr ? game.away_team : game.home_team)
        : null;
      const detail: MatchupPlayer = {
        externalPlayerId: entry.external_player_id,
        name: player?.full_name ?? `Player ${entry.external_player_id}`,
        position: player?.position ?? null,
        nflTeam: player?.team_abbr ?? null,
        slot: entry.slot,
        isStarter: entry.is_starter,
        currentPoints: entry.current_points,
        projectedPoints: entry.projected_points,
        injuryStatus: player?.status ?? null,
        game: game ? {
          opponent,
          startTime: game.start_time,
          status: game.status,
          isOver: game.is_over,
          inProgress: game.in_progress,
          canceled: game.canceled,
          quarter: game.quarter,
        } : null,
      };
      const lineup = lineupsByTeam.get(entry.team_id) ?? { starters: [], bench: [] };
      (entry.is_starter ? lineup.starters : lineup.bench).push(detail);
      lineupsByTeam.set(entry.team_id, lineup);
    }

    for (const lineup of lineupsByTeam.values()) {
      lineup.starters.sort(byLineupSlot);
      lineup.bench.sort(byPlayerName);
    }
  }

  let starterGames: StarterGame[] = [];
  if (week) {
    const { data: starterRows, error: starterError } = await client
      .from("starter_game_state")
      .select("league_id, team_id, is_mine, start_time, is_over, in_progress, canceled, quarter, projected_points")
      .eq("week", week)
      .in("league_id", leagues.map((league) => league.id));

    if (starterError) throw new Error(`starter game state read: ${starterError.message}`);
    starterGames = (starterRows ?? []).flatMap((row) =>
      row.league_id && row.team_id
        ? [{
            leagueId: row.league_id,
            teamId: row.team_id,
            isMine: row.is_mine ?? false,
            startTime: row.start_time,
            isOver: row.is_over ?? false,
            inProgress: row.in_progress ?? false,
            canceled: row.canceled ?? false,
            quarter: row.quarter,
            projectedPoints: row.projected_points,
          }]
        : []
    );
  }

  const startersByTeam = new Map<string, StarterGame[]>();
  for (const starter of starterGames) {
    const list = startersByTeam.get(starter.teamId) ?? [];
    list.push(starter);
    startersByTeam.set(starter.teamId, list);
  }

  const cards: MatchupCard[] = [];

  for (const league of leagues) {
    if (!week) continue;

    const mineTeamForLeague = (teams ?? []).find(
      (team) => team.league_id === league.id && team.is_mine
    );

    const mineRow = (rows ?? []).find(
      (r) =>
        r.league_id === league.id &&
        r.week === week &&
        teamById.get(r.team_id)?.is_mine
    );
    if (!mineRow) {
      if (league.status !== "pre_draft") continue;

      cards.push({
        leagueId: league.id,
        leagueName: league.name,
        leagueExternalId: league.external_id,
        platform: league.platform,
        leagueStatus: "pre_draft",
        teamCount: league.team_count,
        season: league.season,
        week,
        isFinal: false,
        isLive: false,
        winProbability: null,
        starterStatus: {
          mine: EMPTY_STARTER_SUMMARY,
          opponent: null,
        },
        syncedAt: league.synced_at,
        mine: {
          teamId: mineTeamForLeague?.id ?? "",
          externalId: mineTeamForLeague?.external_id ?? "",
          name: mineTeamForLeague?.name ?? "Team not assigned",
          points: null,
          projected: null,
        },
        opponent: null,
      });
      continue;
    }

    const mineTeam = teamById.get(mineRow.team_id);
    if (!mineTeam) continue;

    const oppTeam = mineRow.opponent_team_id
      ? teamById.get(mineRow.opponent_team_id)
      : undefined;
    const oppRow = mineRow.opponent_team_id
      ? rowByTeam.get(`${week}:${mineRow.opponent_team_id}`)
      : undefined;
    const nativeMine = nativeByTeam.get(
      `${league.platform}:${league.external_id}:${mineTeam.external_id}:${week}`
    );
    const nativeOpponent = oppTeam
      ? nativeByTeam.get(
          `${league.platform}:${league.external_id}:${oppTeam.external_id}:${week}`
        )
      : undefined;
    const mineStarters = startersByTeam.get(mineTeam.id) ?? [];
    const opponentStarters = oppTeam ? startersByTeam.get(oppTeam.id) ?? [] : [];
    const probability = oppTeam && oppRow
      ? winProbability(
          mineRow.points ?? 0,
          oppRow.points ?? 0,
          mineStarters,
          opponentStarters,
          mineRow.is_final
        )
      : null;

    cards.push({
      leagueId: league.id,
      leagueName: league.name,
      leagueExternalId: league.external_id,
      platform: league.platform,
      leagueStatus: league.status === "complete" ? "complete" : "in_season",
      teamCount: league.team_count,
      season: league.season,
      week,
      isFinal: mineRow.is_final,
      isLive: [...mineStarters, ...opponentStarters].some((starter) => starter.inProgress),
      winProbability: probability,
      starterStatus: {
        mine: summarizeStarterStates(mineStarters),
        opponent: oppTeam ? summarizeStarterStates(opponentStarters) : null,
      },
      syncedAt: league.synced_at,
      mine: {
        teamId: mineTeam.id,
        externalId: mineTeam.external_id,
        name: mineTeam.name ?? "My team",
        points: mineRow.points,
        projected: nativeMine ?? mineRow.projected_points,
        lineup: lineupsByTeam.get(mineTeam.id),
      },
      opponent:
        oppTeam && oppRow
          ? {
              teamId: oppTeam.id,
              externalId: oppTeam.external_id,
              name: oppTeam.name ?? "Opponent",
              points: oppRow.points,
              projected: nativeOpponent ?? oppRow.projected_points,
              lineup: lineupsByTeam.get(oppTeam.id),
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

const SLOT_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX", "K", "DEF"];

function byLineupSlot(a: MatchupPlayer, b: MatchupPlayer): number {
  const aIndex = SLOT_ORDER.indexOf(a.slot ?? "");
  const bIndex = SLOT_ORDER.indexOf(b.slot ?? "");
  const slotOrder = (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
  return slotOrder || byPlayerName(a, b);
}

function byPlayerName(a: MatchupPlayer, b: MatchupPlayer): number {
  return a.name.localeCompare(b.name);
}
