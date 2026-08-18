import "server-only";
import { db, dbConfigured } from "@/db/client";
import {
  buildLeagueScoreboard,
  byDrama,
  orderLeagueStandings,
  type LeagueScoreboardTeam,
  type MatchupCard,
  type MatchupPlayer,
  type TeamLineup,
} from "./matchup";
import { buildWeekOptions, resolveWeek, type WeekOption } from "./weeks";
import {
  EMPTY_STARTER_SUMMARY,
  summarizeStarterStates,
  winProbability,
  type StarterGame,
} from "./game-state";
import { canonicalLeagueType, choppedSummary } from "./league-format";

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
    .select("id, name, external_id, platform, season, current_week, synced_at, status, team_count, scoring_raw, format, league_type");

  if (error) throw new Error(`leagues read: ${error.message}`);
  if (!leagues?.length) return { ...EMPTY, configured: true };

  // Leagues can disagree about the current week (different platforms, or
  // one league already eliminated). The furthest-along wins for defaults.
  const currentWeek = Math.max(...leagues.map((l) => l.current_week ?? 0), 0) || null;

  // Whole weeks rather than just my own row, deliberately: M5's
  // whole-league toggle needs exactly this data and it's a few dozen rows.
  const { data: rows, error: matchupError } = await client
    .from("matchups")
    .select("league_id, week, matchup_key, points, projected_points, is_final, team_id, opponent_team_id")
    .in(
      "league_id",
      leagues.map((l) => l.id)
    );

  if (matchupError) throw new Error(`matchups read: ${matchupError.message}`);

  const { data: teams, error: teamError } = await client
    .from("teams")
    .select("id, league_id, name, manager_name, external_id, is_mine, wins, losses, ties, points_for, points_against, standing");

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
  for (const row of selectedRows) relevantTeamIds.add(row.team_id);

  const lineupsByTeam = new Map<string, TeamLineup>();
  if (week && relevantTeamIds.size > 0) {
    const { data: entries, error: entryError } = await client
      .from("roster_entries")
      .select("team_id, player_id, external_player_id, slot, is_starter, lineup_order, current_points, projected_points")
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
        lineupOrder: entry.lineup_order,
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
      if (entry.is_starter) lineup.starters.push(detail);
      else if (entry.slot === "BN" || entry.slot === null) lineup.bench.push(detail);
      lineupsByTeam.set(entry.team_id, lineup);
    }

    for (const lineup of lineupsByTeam.values()) {
      lineup.starters.sort(byLineupOrder);
      lineup.bench.sort(byBenchPosition);
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
        leagueFormat: league.format === "chopped" ? "chopped" : "head_to_head",
        leagueType: canonicalLeagueType(league.league_type),
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
        chopped: null,
        scoreboard: [],
        standings: [],
      });
      continue;
    }

    const mineTeam = teamById.get(mineRow.team_id);
    if (!mineTeam) continue;

    const leagueFormat = league.format === "chopped" ? "chopped" : "head_to_head";

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
    const chopped = leagueFormat === "chopped"
      ? choppedSummary((rows ?? []).flatMap((row) => {
          if (row.league_id !== league.id || row.week !== week) return [];
          const team = teamById.get(row.team_id);
          if (!team) return [];
          const native = nativeByTeam.get(
            `${league.platform}:${league.external_id}:${team.external_id}:${week}`
          );
          return [{
            teamId: team.id,
            name: team.name ?? `Roster ${team.external_id}`,
            points: row.points,
            projected: native ?? row.projected_points,
            isMine: team.is_mine,
          }];
        }))
      : null;
    const choppedStarters = leagueFormat === "chopped"
      ? starterGames.filter((starter) => starter.leagueId === league.id)
      : [];
    const scoreboard = leagueFormat === "head_to_head"
      ? buildLeagueScoreboard(
          selectedRows
            .filter((row) => row.league_id === league.id)
            .map((row) => {
              const team = teamById.get(row.team_id);
              const native = team
                ? nativeByTeam.get(`${league.platform}:${league.external_id}:${team.external_id}:${week}`)
                : undefined;
              return {
                matchupKey: row.matchup_key,
                teamId: row.team_id,
                opponentTeamId: row.opponent_team_id,
                points: row.points,
                projected: native ?? row.projected_points,
                isFinal: row.is_final,
              };
            }),
          (teams ?? []).flatMap((team): LeagueScoreboardTeam[] => {
            if (team.league_id !== league.id) return [];
            const row = selectedRows.find((candidate) => candidate.team_id === team.id);
            if (!row) return [];
            const native = nativeByTeam.get(
              `${league.platform}:${league.external_id}:${team.external_id}:${week}`
            );
            return [{
              teamId: team.id,
              externalId: team.external_id,
              name: team.name ?? `Roster ${team.external_id}`,
              points: row.points,
              projected: native ?? row.projected_points,
              lineup: lineupsByTeam.get(team.id),
              isMine: team.is_mine,
              starterStatus: summarizeStarterStates(startersByTeam.get(team.id) ?? []),
            }];
          })
        )
      : [];
    const standings = leagueFormat === "head_to_head"
      ? orderLeagueStandings((teams ?? []).flatMap((team) => team.league_id === league.id ? [{
          teamId: team.id,
          name: team.name ?? `Roster ${team.external_id}`,
          managerName: team.manager_name,
          isMine: team.is_mine,
          wins: team.wins ?? 0,
          losses: team.losses ?? 0,
          ties: team.ties ?? 0,
          pointsFor: team.points_for,
          pointsAgainst: team.points_against,
          standing: team.standing,
        }] : []))
      : [];

    cards.push({
      leagueId: league.id,
      leagueName: league.name,
      leagueExternalId: league.external_id,
      platform: league.platform,
      leagueStatus: league.status === "complete" ? "complete" : "in_season",
      leagueFormat,
      leagueType: canonicalLeagueType(league.league_type),
      teamCount: league.team_count,
      season: league.season,
      week,
      isFinal: mineRow.is_final,
      isLive: [...mineStarters, ...opponentStarters, ...choppedStarters].some((starter) => starter.inProgress),
      winProbability: leagueFormat === "chopped" ? null : probability,
      starterStatus: {
        mine: summarizeStarterStates(mineStarters),
        opponent: leagueFormat === "chopped"
          ? null
          : oppTeam ? summarizeStarterStates(opponentStarters) : null,
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
        leagueFormat === "head_to_head" && oppTeam && oppRow
          ? {
              teamId: oppTeam.id,
              externalId: oppTeam.external_id,
              name: oppTeam.name ?? "Opponent",
              points: oppRow.points,
              projected: nativeOpponent ?? oppRow.projected_points,
              lineup: lineupsByTeam.get(oppTeam.id),
            }
          : null,
      chopped,
      scoreboard,
      standings,
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

function byLineupOrder(a: MatchupPlayer, b: MatchupPlayer): number {
  return a.lineupOrder - b.lineupOrder || byPlayerName(a, b);
}

const BENCH_POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

function byBenchPosition(a: MatchupPlayer, b: MatchupPlayer): number {
  const aIndex = BENCH_POSITION_ORDER.indexOf(a.position ?? "");
  const bIndex = BENCH_POSITION_ORDER.indexOf(b.position ?? "");
  const positionOrder = (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
  return positionOrder || byLineupOrder(a, b);
}

function byPlayerName(a: MatchupPlayer, b: MatchupPlayer): number {
  return a.name.localeCompare(b.name);
}
