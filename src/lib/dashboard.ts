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
import { buildWeekOptions, currentLeagueWeek, resolveWeek, type WeekOption } from "./weeks";
import {
  EMPTY_STARTER_SUMMARY,
  summarizeStarterStates,
  winProbability,
  type StarterGame,
} from "./game-state";
import { canonicalLeagueType, choppedSummary } from "./league-format";
import { preferProjection, type NativeProjection } from "./projection";
import { fillEmptyStarterSlots } from "./lineup-slots";
import { readAll, readAllIn } from "./read-all";
import { rosterPositionsFromRaw } from "@/sync/slots";
import { buildScoreboard, type NflGameBox, type NflGameRow } from "./nfl-scoreboard";

export type { WeekOption } from "./weeks";

export interface Dashboard {
  configured: boolean;
  cards: MatchupCard[];
  /** Real NFL games for the selected week — the "around the league" rail. */
  games: NflGameBox[];
  lastSyncedAt: string | null;
  leagueCount: number;
  /** The week actually being shown, after clamping whatever was asked for. */
  week: number | null;
  weeks: WeekOption[];
}

const EMPTY: Dashboard = {
  configured: false,
  cards: [],
  games: [],
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
export async function getDashboard(ownerId: string, requestedWeek?: number): Promise<Dashboard> {
  if (!dbConfigured()) return EMPTY;

  const client = db();

  const { data: leagues, error } = await client
    .from("leagues")
    .select("id, name, external_id, platform, season, current_week, synced_at, status, team_count, scoring_raw, format, league_type")
    .eq("owner_id", ownerId);

  if (error) throw new Error(`leagues read: ${error.message}`);
  if (!leagues?.length) return { ...EMPTY, configured: true };

  // Leagues can disagree about the current week (different platforms, or
  // one league already eliminated). The furthest-along wins for defaults.
  const leagueWeekMetadata = leagues.map((league) => ({
    currentWeek: league.current_week,
    scoringRaw: league.scoring_raw,
    status: league.status,
  }));
  const currentWeek = currentLeagueWeek(leagueWeekMetadata);

  // Whole weeks rather than just my own row, deliberately: M5's
  // whole-league toggle needs exactly this data and it's a few dozen rows.
  const rows = await readAll(
    (from, to) =>
      client
        .from("matchups")
        .select("league_id, week, matchup_key, points, projected_points, is_final, team_id, opponent_team_id")
        .in(
          "league_id",
          leagues.map((l) => l.id)
        )
        .order("id")
        .range(from, to),
    "matchups read"
  );

  const teams = await readAll(
    (from, to) =>
      client
        .from("teams")
        .select("id, league_id, name, manager_name, external_id, is_mine, wins, losses, ties, points_for, points_against, standing")
        .in("league_id", leagues.map((league) => league.id))
        .order("id")
        .range(from, to),
    "teams read"
  );

  // A league whose newest provider run errored keeps rendering its last good
  // scores, but says so on the card. Newest-first, then first-seen wins.
  const { data: runs, error: runError } = await client
    .from("sync_runs")
    .select("league_id, status, error, finished_at, started_at")
    .eq("owner_id", ownerId)
    .order("started_at", { ascending: false })
    .limit(300);
  if (runError) throw new Error(`sync runs read: ${runError.message}`);
  const failureByLeague = new Map<string, { message: string | null; at: string | null }>();
  const seenLeagues = new Set<string>();
  for (const run of runs ?? []) {
    if (!run.league_id || seenLeagues.has(run.league_id)) continue;
    seenLeagues.add(run.league_id);
    if (run.status === "error") {
      failureByLeague.set(run.league_id, {
        message: run.error,
        at: run.finished_at ?? run.started_at,
      });
    }
  }

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const rowByTeam = new Map(rows.map((r) => [`${r.week}:${r.team_id}`, r]));

  const nativeRows = await readAll(
    (from, to) =>
      client
        .from("native_projections")
        .select("platform, external_league_id, external_team_id, week, projected_points, captured_at")
        .eq("owner_id", ownerId)
        .in(
          "external_league_id",
          leagues.map((league) => league.external_id)
        )
        .order("id")
        .range(from, to),
    "native projections read"
  );
  const nativeByTeam = new Map(
    nativeRows.map((row) => [
      `${row.platform}:${row.external_league_id}:${row.external_team_id}:${row.week}`,
      { points: row.projected_points, capturedAt: row.captured_at },
    ])
  );

  // The full season remains selectable, including future/unsynced weeks and
  // preseason. Provider settings can narrow or extend the normal 18-week rail.
  const weeks = buildWeekOptions(leagueWeekMetadata, rows.map((row) => row.week));

  const week = resolveWeek(
    requestedWeek,
    weeks.map((w) => w.week),
    currentWeek
  );

  const selectedRows = rows.filter((row) => row.week === week);
  const relevantTeamIds = new Set<string>();
  for (const row of selectedRows) relevantTeamIds.add(row.team_id);

  const lineupsByTeam = new Map<string, TeamLineup>();
  if (week && relevantTeamIds.size > 0) {
    const entries = await readAllIn(
      [...relevantTeamIds],
      (chunk, from, to) =>
        client
          .from("roster_entries")
          .select("team_id, player_id, external_player_id, slot, is_starter, lineup_order, current_points, projected_points")
          .eq("week", week)
          .in("team_id", chunk)
          .order("id")
          .range(from, to),
      "lineup read"
    );

    const playerIds = [...new Set(entries.flatMap((entry) => entry.player_id ? [entry.player_id] : []))];
    const seasons = [...new Set(leagues.map((league) => league.season))];
    const [playerRows, gameRows] = await Promise.all([
      readAllIn(
        playerIds,
        (chunk, from, to) =>
          client
            .from("players")
            .select("id, full_name, position, team_abbr, status")
            .in("id", chunk)
            .order("id")
            .range(from, to),
        "lineup player read"
      ),
      readAll(
        (from, to) =>
          client
            .from("nfl_games")
            .select("season, home_team, away_team, start_time, status, is_over, in_progress, canceled, quarter")
            .eq("week", week)
            .in("season", seasons)
            .order("game_id")
            .range(from, to),
        "lineup game read"
      ),
    ]);

    const playerById = new Map(playerRows.map((player) => [player.id, player]));
    const seasonByTeam = new Map(teams.map((team) => [
      team.id,
      leagues.find((league) => league.id === team.league_id)?.season ?? null,
    ]) ?? []);
    const gameByTeam = new Map<string, NonNullable<typeof gameRows>[number]>();
    for (const game of gameRows) {
      if (game.home_team) gameByTeam.set(`${game.season}:${game.home_team}`, game);
      if (game.away_team) gameByTeam.set(`${game.season}:${game.away_team}`, game);
    }

    for (const entry of entries) {
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

    // Slot gaps are restored per team, so the ordered roster positions come
    // from that team's own league rather than a shared assumption.
    const leagueByTeam = new Map(
      teams.map((team) => [team.id, leagues.find((league) => league.id === team.league_id)])
    );
    for (const [teamId, lineup] of lineupsByTeam) {
      lineup.starters.sort(byLineupOrder);
      lineup.starters = fillEmptyStarterSlots(
        lineup.starters,
        rosterPositionsFromRaw(leagueByTeam.get(teamId)?.scoring_raw)
      );
      lineup.bench.sort(byBenchPosition);
    }
  }

  let games: NflGameBox[] = [];
  if (week) {
    const { data: gameRows, error: gameError } = await client
      .from("nfl_games")
      .select("game_id, home_team, away_team, start_time, status, is_over, in_progress, canceled, quarter, raw")
      .eq("week", week)
      .in("season", [...new Set(leagues.map((league) => league.season))]);
    if (gameError) throw new Error(`nfl games read: ${gameError.message}`);
    games = buildScoreboard(
      (gameRows ?? []).map((row): NflGameRow => ({
        gameId: row.game_id,
        homeTeam: row.home_team,
        awayTeam: row.away_team,
        startTime: row.start_time,
        status: row.status,
        isOver: row.is_over,
        inProgress: row.in_progress,
        canceled: row.canceled,
        quarter: row.quarter,
        raw: row.raw,
      }))
    );
  }

  let starterGames: StarterGame[] = [];
  if (week) {
    const starterRows = await readAll(
      (from, to) =>
        client
          .from("starter_game_state")
          .select("league_id, team_id, is_mine, start_time, is_over, in_progress, canceled, quarter, projected_points")
          .eq("week", week)
          .in("league_id", leagues.map((league) => league.id))
          // The view has no key of its own; this pair is unique per row.
          .order("team_id")
          .order("external_player_id")
          .range(from, to),
      "starter game state read"
    );

    starterGames = starterRows.flatMap((row) =>
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
    const cardWeek = week ?? 1;

    const mineTeamForLeague = teams.find(
      (team) => team.league_id === league.id && team.is_mine
    );

    const mineRow = rows.find(
      (r) =>
        r.league_id === league.id &&
        r.week === week &&
        teamById.get(r.team_id)?.is_mine
    );
    // Provider schedules can contain placeholder games before a draft. The
    // canonical league status is authoritative, so never turn those rows into
    // a live matchup card.
    if (league.status === "pre_draft") {
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
        week: cardWeek,
        isFinal: false,
        isLive: false,
        winProbability: null,
        starterStatus: {
          mine: EMPTY_STARTER_SUMMARY,
          opponent: null,
        },
        syncedAt: league.synced_at,
        syncFailure: failureByLeague.get(league.id) ?? null,
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

    if (!mineRow) continue;

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
    const projection = (
      native: NativeProjection | undefined,
      computed: number | null
    ) => preferProjection(native, computed, league.synced_at);
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
      ? choppedSummary(rows.flatMap((row) => {
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
            projected: preferProjection(native, row.projected_points, league.synced_at),
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
                projected: preferProjection(native, row.projected_points, league.synced_at),
                isFinal: row.is_final,
              };
            }),
          teams.flatMap((team): LeagueScoreboardTeam[] => {
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
              projected: preferProjection(native, row.projected_points, league.synced_at),
              lineup: lineupsByTeam.get(team.id),
              isMine: team.is_mine,
              starterStatus: summarizeStarterStates(startersByTeam.get(team.id) ?? []),
            }];
          })
        )
      : [];
    const standings = leagueFormat === "head_to_head"
      ? orderLeagueStandings(teams.flatMap((team) => team.league_id === league.id ? [{
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
      week: cardWeek,
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
      syncFailure: failureByLeague.get(league.id) ?? null,
      mine: {
        teamId: mineTeam.id,
        externalId: mineTeam.external_id,
        name: mineTeam.name ?? "My team",
        points: mineRow.points,
        projected: projection(nativeMine, mineRow.projected_points),
        lineup: lineupsByTeam.get(mineTeam.id),
      },
      opponent:
        leagueFormat === "head_to_head" && oppTeam && oppRow
          ? {
              teamId: oppTeam.id,
              externalId: oppTeam.external_id,
              name: oppTeam.name ?? "Opponent",
              points: oppRow.points,
              projected: projection(nativeOpponent, oppRow.projected_points),
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
    games,
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
