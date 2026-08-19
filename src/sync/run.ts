/**
 * Sync orchestrator.
 *
 * The only code in the app allowed to touch a platform API. It loops
 * adapters, normalizes into the canonical tables, and logs every run to
 * sync_runs whether it succeeds or not.
 *
 * Modes mirror the cron cadence in CLAUDE.md:
 *   players — Sleeper player directory + crosswalk rebuild   (04:00 ET)
 *   daily   — leagues, teams, rosters, transactions, schedule (06:00 ET)
 *   live    — matchups + scores only (at most once/min while games are live)
 *
 * A platform that throws is contained: its sync_runs row goes to 'error'
 * and the remaining platforms still run. Nothing here rethrows past
 * runSync(), because a broken ESPN must never take down Sleeper.
 */

import type { Db } from "@/db/admin";
import type { Json } from "@/db/types.gen";
import { sleeperAdapter } from "@/adapters/sleeper";
import { yahooAdapter } from "@/adapters/yahoo";
import type {
  CanonicalLeague,
  CanonicalTeam,
  Credentials,
  PlatformAdapter,
  Platform,
  Sport,
} from "@/adapters/types";
import { CrosswalkIndex, type CanonicalPlayerRow } from "./crosswalk";
import { resolveSlot, rosterPositionsFromRaw } from "./slots";
import { seasonEndWeek } from "@/lib/weeks";
import {
  decryptYahooRefreshToken,
  encryptYahooRefreshToken,
  yahooOAuthConfigured,
} from "@/lib/yahoo-oauth";

export type SyncMode = "live" | "account" | "daily" | "players" | "backfill";

export interface SyncResult {
  platform: Platform;
  mode: SyncMode;
  status: "ok" | "error";
  stats: Record<string, number>;
  error?: string;
}

const SPORT: Sport = "nfl";

interface EnabledPlatform {
  adapter: PlatformAdapter;
  creds: Credentials | Error;
  ownerId: string | null;
}

async function enabledPlatforms(db: Db, requestedOwnerId?: string): Promise<EnabledPlatform[]> {
  const out: EnabledPlatform[] = [];

  let accountQuery = db
    .from("platform_accounts")
    .select("owner_id, platform, external_user_id, username, secrets");
  if (requestedOwnerId) accountQuery = accountQuery.eq("owner_id", requestedOwnerId);
  const { data: accounts, error: accountError } = await accountQuery;
  if (accountError) throw new Error(`Platform account read: ${accountError.message}`);

  for (const account of accounts ?? []) {
    if (account.platform === "sleeper") {
      const username = account.external_user_id ?? account.username;
      if (username) out.push({
        adapter: sleeperAdapter,
        creds: { platform: "sleeper", username },
        ownerId: account.owner_id,
      });
    }
  }

  // There is deliberately no ownerless path. SLEEPER_USERNAME used to add one
  // here, which meant the nightly cron — which calls runSync with no owner —
  // wrote a third, unowned copy of every league beside the real accounts':
  // 12 leagues, 140 teams, 1050 matchups, and 21,873 roster entries that no
  // owner-scoped query could ever return. The env var still drives the
  // fixture recorder and the smoke script, which talk to Sleeper directly and
  // write nothing.

  if (yahooOAuthConfigured()) {
    for (const account of (accounts ?? []).filter((row) => row.platform === "yahoo")) {
      const secrets = account.secrets && typeof account.secrets === "object" && !Array.isArray(account.secrets)
        ? account.secrets as Record<string, unknown>
        : {};
      const sealed = typeof secrets.refresh_token_enc === "string"
        ? secrets.refresh_token_enc
        : null;
      try {
        if (!sealed) throw new Error("Yahoo refresh token is missing. Reconnect Yahoo.");
        out.push({
          adapter: yahooAdapter,
          creds: { platform: "yahoo", refreshToken: decryptYahooRefreshToken(sealed) },
          ownerId: account.owner_id,
        });
      } catch (cause) {
        out.push({
          adapter: yahooAdapter,
          creds: cause instanceof Error ? cause : new Error("Yahoo credentials could not be decrypted."),
          ownerId: account.owner_id,
        });
      }
    }
  }

  return out;
}

export async function runSync(
  db: Db,
  mode: SyncMode,
  season: number,
  platforms?: Platform[],
  ownerId?: string
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];

  for (const { adapter, creds, ownerId: connectionOwnerId } of (await enabledPlatforms(db, ownerId)).filter(
    ({ adapter }) => !platforms || platforms.includes(adapter.platform)
  )) {
    if (mode === "players" && !adapter.getPlayerDirectory) continue;
    const { data: run } = await db
      .from("sync_runs")
      .insert({ platform: adapter.platform, owner_id: connectionOwnerId, status: "running" })
      .select("id")
      .single();

    const stats: Record<string, number> = {};

    try {
      if (creds instanceof Error) throw creds;
      const activeCreds = adapter.refreshCredentials
        ? await adapter.refreshCredentials(creds)
        : creds;
      if (
        activeCreds.platform === "yahoo"
        && creds.platform === "yahoo"
        && activeCreds.refreshToken !== creds.refreshToken
      ) {
        const { error } = await db
          .from("platform_accounts")
          .update({
            secrets: {
              version: 1,
              refresh_token_enc: encryptYahooRefreshToken(activeCreds.refreshToken),
            },
            expires_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
          })
          .eq("platform", "yahoo")
          .eq("owner_id", connectionOwnerId ?? "00000000-0000-0000-0000-000000000000");
        if (error) throw new Error(`Yahoo refresh token rotation save: ${error.message}`);
      }
      if (mode === "players") {
        Object.assign(stats, await syncPlayers(db, adapter));
      } else if (mode === "account") {
        Object.assign(stats, await syncDaily(db, adapter, activeCreds, season, connectionOwnerId, false));
        const current = await syncScores(db, adapter, activeCreds, season, "missing", connectionOwnerId);
        Object.assign(stats, {
          account_refresh: 1,
          matchup_leagues: current.leagues,
          matchups: current.matchups,
          matchup_weeks: current.weeks,
          games: current.games,
          game_state_errors: current.game_state_errors,
        });
      } else if (mode === "daily") {
        Object.assign(stats, await syncDaily(db, adapter, activeCreds, season, connectionOwnerId));
        const schedule = await syncScores(db, adapter, activeCreds, season, "backfill", connectionOwnerId);
        Object.assign(stats, {
          matchup_leagues: schedule.leagues,
          matchups: schedule.matchups,
          matchup_weeks: schedule.weeks,
          games: schedule.games,
          game_state_errors: schedule.game_state_errors,
        });
      } else {
        Object.assign(stats, await syncScores(db, adapter, activeCreds, season, mode, connectionOwnerId));
      }

      results.push({ platform: adapter.platform, mode, status: "ok", stats });

      if (run) {
        await db
          .from("sync_runs")
          .update({
            status: "ok",
            finished_at: new Date().toISOString(),
            stats: stats as Json,
          })
          .eq("id", run.id);
      }

      await db
        .from("platform_accounts")
        .update({ last_ok_at: new Date().toISOString() })
        .eq("platform", adapter.platform)
        .eq("owner_id", connectionOwnerId ?? "00000000-0000-0000-0000-000000000000");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        platform: adapter.platform,
        mode,
        status: "error",
        stats,
        error: message,
      });

      if (run) {
        await db
          .from("sync_runs")
          .update({
            status: "error",
            finished_at: new Date().toISOString(),
            error: message,
            stats: stats as Json,
          })
          .eq("id", run.id);
      }
    }
  }

  return results;
}

// ---------- players ----------

/**
 * Sleeper's directory becomes the canonical `players` table. Because it
 * IS the source, its own crosswalk rows are exact by construction — the
 * tiered matching in crosswalk.ts is what ESPN and Yahoo will need.
 */
async function syncPlayers(
  db: Db,
  adapter: PlatformAdapter
): Promise<Record<string, number>> {
  if (!adapter.getPlayerDirectory) return { players: 0 };

  const directory = await adapter.getPlayerDirectory(SPORT);

  // player_ids is the identity map, so it — not a name match — decides
  // whether we've seen this player before. `players` has no natural key
  // (uuid default), so upserting blind would insert 11k fresh rows daily.
  const known = await loadCrosswalk(db, adapter.platform);

  const rows = directory.map((p) => ({
    // Minting the uuid here rather than letting Postgres default it keeps
    // the external_id -> uuid pairing exact. Insert order is not a
    // contract, so we can't zip the returned ids against the input.
    id: known.get(p.externalId) ?? crypto.randomUUID(),
    externalId: p.externalId,
    isNew: !known.has(p.externalId),
    fields: {
      sport: SPORT,
      full_name: p.fullName,
      position: p.position,
      team_abbr: p.teamAbbr,
      gsis_id: p.gsisId ?? null,
      sportradar_id: p.sportradarId ?? null,
      updated_at: new Date().toISOString(),
    },
  }));

  // ~11k rows. Chunked because PostgREST bodies get unhappy past a few MB.
  const CHUNK = 500;
  let added = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);

    const { error } = await db
      .from("players")
      .upsert(
        slice.map((r) => ({ id: r.id, ...r.fields })),
        { onConflict: "id" }
      );
    if (error) throw new Error(`players upsert: ${error.message}`);

    const fresh = slice.filter((r) => r.isNew);
    if (fresh.length) {
      const { error: linkError } = await db.from("player_ids").upsert(
        fresh.map((r) => ({
          player_id: r.id,
          platform: adapter.platform,
          external_id: r.externalId,
          confidence: 1.0,
        })),
        { onConflict: "platform,external_id" }
      );
      if (linkError) throw new Error(`player_ids upsert: ${linkError.message}`);
      added += fresh.length;
    }
  }

  return { players: rows.length, new_players: added };
}

/** Load every canonical player once so roster rows can be crosswalked in memory. */
async function loadCrosswalk(db: Db, platform: Platform): Promise<Map<string, string>> {
  const byExternalId = new Map<string, string>();
  const PAGE = 1000;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("player_ids")
      .select("external_id, player_id")
      .eq("platform", platform)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`player_ids read: ${error.message}`);
    for (const row of data ?? []) byExternalId.set(row.external_id, row.player_id);
    if (!data || data.length < PAGE) break;
  }

  return byExternalId;
}

/** Exposed for the /admin/unmatched page and for tests. */
export async function buildIndex(db: Db): Promise<CrosswalkIndex> {
  const rows: CanonicalPlayerRow[] = [];
  const PAGE = 1000;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("players")
      .select("id, full_name, position, team_abbr, gsis_id, sportradar_id")
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`players read: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  return new CrosswalkIndex(rows);
}

// ---------- daily ----------

async function syncDaily(
  db: Db,
  adapter: PlatformAdapter,
  creds: Credentials,
  season: number,
  ownerId: string | null,
  includeTransactions = true
): Promise<Record<string, number>> {
  const leagues = await adapter.listLeagues(creds, SPORT, season);
  const crosswalk = await loadCrosswalk(db, adapter.platform);
  const crosswalkIndex = adapter.platform === "sleeper" ? null : await buildIndex(db);

  let teamCount = 0;
  let rosterCount = 0;
  let transactionCount = 0;

  for (const league of leagues) {
    const leagueId = await upsertLeague(db, adapter.platform, league, ownerId);

    const teams = await adapter.getTeams(creds, league.externalId, season);
    const teamIds = await upsertTeams(db, leagueId, teams);
    teamCount += teams.length;

    // Rosters are current state, replaced wholesale each sync.
    const entries = await adapter.getRosters(
      creds,
      league.externalId,
      season,
      league.currentWeek ?? undefined
    );
    if (crosswalkIndex) {
      const newLinks = entries.flatMap((entry) => {
        if (crosswalk.has(entry.externalPlayerId) || !entry.playerRef) return [];
        const match = crosswalkIndex.match(entry.playerRef);
        if (!match) return [];
        crosswalk.set(entry.externalPlayerId, match.playerId);
        return [{
          platform: adapter.platform,
          external_id: entry.externalPlayerId,
          player_id: match.playerId,
          confidence: match.confidence,
        }];
      });
      if (newLinks.length) {
        const { error } = await db
          .from("player_ids")
          .upsert(newLinks, { onConflict: "platform,external_id" });
        if (error) throw new Error(`player_ids crosswalk: ${error.message}`);
      }
    }
    const positions = rosterPositionsFromRaw(league.scoringRaw);

    const rows = entries
      .map((e) => {
        const teamId = teamIds.get(e.teamExternalId);
        if (!teamId) return null;
        return {
          team_id: teamId,
          player_id: crosswalk.get(e.externalPlayerId) ?? null,
          external_player_id: e.externalPlayerId,
          slot: resolveSlot(e.slot, positions),
          is_starter: e.isStarter,
          lineup_order: e.lineupOrder,
          week: e.week,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const ids = [...teamIds.values()];
    if (ids.length) {
      let clear = db.from("roster_entries").delete().in("team_id", ids);
      if (league.currentWeek !== null) clear = clear.eq("week", league.currentWeek);
      const { error } = await clear;
      if (error) throw new Error(`roster_entries clear: ${error.message}`);
    }
    if (rows.length) {
      const { error } = await db.from("roster_entries").insert(rows);
      if (error) throw new Error(`roster_entries insert: ${error.message}`);
      rosterCount += rows.length;
    }

    const transactions = includeTransactions
      ? await adapter.getTransactions(creds, league.externalId, season)
      : [];
    if (transactions.length) {
      const { error } = await db.from("transactions").upsert(
        transactions.map((t) => ({
          league_id: leagueId,
          external_id: t.externalId,
          type: t.type,
          week: t.week,
          occurred_at: t.occurredAt,
          payload: t.payload as Json,
        })),
        { onConflict: "league_id,external_id" }
      );
      if (error) throw new Error(`transactions upsert: ${error.message}`);
      transactionCount += transactions.length;
    }

    await db
      .from("leagues")
      .update({ synced_at: new Date().toISOString() })
      .eq("id", leagueId);
  }

  return {
    leagues: leagues.length,
    teams: teamCount,
    roster_entries: rosterCount,
    transactions: transactionCount,
  };
}

// ---------- live / backfill ----------

/**
 * Which weeks to pull for a league.
 *
 *   live     — just the current week, at most once per minute on gameday
 *   backfill — every published season week, including future pairings.
 *              One call per league per week; projections are memoized.
 */
export function weeksFor(
  mode: "live" | "backfill",
  currentWeek: number,
  finalWeek = 18
): number[] {
  if (currentWeek < 1) return [];
  if (mode === "live") return [currentWeek];
  const end = Math.max(currentWeek, Math.min(Math.trunc(finalWeek), 25));
  return Array.from({ length: end }, (_, i) => i + 1);
}

/**
 * Account refreshes always update the current week and fill only absent season
 * weeks. This catches leagues that draft or publish schedules after the daily
 * backfill without repeatedly downloading every matchup.
 */
export function missingWeeksFor(
  currentWeek: number,
  existingWeeks: number[],
  finalWeek = 18
): number[] {
  const existing = new Set(existingWeeks);
  return weeksFor("backfill", currentWeek, finalWeek).filter(
    (week) => week === currentWeek || !existing.has(week)
  );
}

async function syncScores(
  db: Db,
  adapter: PlatformAdapter,
  creds: Credentials,
  season: number,
  mode: "live" | "backfill" | "missing",
  ownerId: string | null
): Promise<Record<string, number>> {
  let leagueQuery = db
    .from("leagues")
    .select("id, external_id, current_week, scoring_raw, status")
    .eq("platform", adapter.platform)
    .eq("season", season);
  leagueQuery = ownerId ? leagueQuery.eq("owner_id", ownerId) : leagueQuery.is("owner_id", null);
  const { data: leagues, error } = await leagueQuery;

  if (error) throw new Error(`leagues read: ${error.message}`);
  if (!leagues?.length) {
    // Nothing to score yet — run `daily` first.
    return { leagues: 0, matchups: 0, weeks: 0 };
  }

  const weeksByLeague = new Map<string, number[]>(await Promise.all(
    leagues.map(async (league) => {
      if (league.status === "pre_draft" || !league.current_week) {
        return [league.id, [] as number[]] as const;
      }
      if (mode !== "missing") {
        return [
          league.id,
          weeksFor(mode, league.current_week, seasonEndWeek(league.scoring_raw)),
        ] as const;
      }

      const { data: existing, error: matchupError } = await db
        .from("matchups")
        .select("week")
        .eq("league_id", league.id);
      if (matchupError) throw new Error(`matchup weeks read: ${matchupError.message}`);
      return [
        league.id,
        missingWeeksFor(
          league.current_week,
          [...new Set((existing ?? []).map((row) => row.week))],
          seasonEndWeek(league.scoring_raw)
        ),
      ] as const;
    })
  ));
  const requestedWeeks = [...new Set([...weeksByLeague.values()].flat())];
  const gameState = await syncGameStates(db, adapter, season, requestedWeeks, ownerId);
  const crosswalk = await loadCrosswalk(db, adapter.platform);

  let matchupCount = 0;
  let weekCount = 0;

  for (const league of leagues) {
    const currentWeek = league.current_week;
    if (!currentWeek || league.status === "pre_draft") continue;
    const leagueWeeks = weeksByLeague.get(league.id) ?? [];

    const { data: teamRows, error: teamError } = await db
      .from("teams")
      .select("id, external_id")
      .eq("league_id", league.id);

    if (teamError) throw new Error(`teams read: ${teamError.message}`);
    const teamIds = new Map((teamRows ?? []).map((t) => [t.external_id, t.id]));

    for (const week of leagueWeeks) {
      const matchups = await adapter.getMatchups(
        creds,
        league.external_id,
        season,
        week
      );
      weekCount++;

      const playerRows = matchups.flatMap((matchup) => {
        const teamId = teamIds.get(matchup.teamExternalId);
        if (!teamId) return [];
        return (matchup.playerStats ?? []).map((player) => ({
          team_id: teamId,
          player_id: crosswalk.get(player.externalPlayerId) ?? null,
          external_player_id: player.externalPlayerId,
          is_starter: player.isStarter,
          lineup_order: player.lineupOrder,
          week,
          current_points: player.currentPoints,
          projected_points: player.projectedPoints,
        }));
      });

      if (playerRows.length) {
        const { error: playerError } = await db
          .from("roster_entries")
          .upsert(playerRows, { onConflict: "team_id,external_player_id,week" });
        if (playerError) throw new Error(`player stats upsert: ${playerError.message}`);
      }

      const rows = matchups
        .map((m) => {
          const teamId = teamIds.get(m.teamExternalId);
          if (!teamId) return null;
          return {
            league_id: league.id,
            week: m.week,
            matchup_key: m.matchupKey,
            team_id: teamId,
            opponent_team_id: m.opponentExternalId
              ? (teamIds.get(m.opponentExternalId) ?? null)
              : null,
            points: m.points,
            projected_points: m.projectedPoints,
            is_final: m.isFinal || gameState.finalWeeks.has(m.week),
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length) {
        const { error: upsertError } = await db
          .from("matchups")
          .upsert(rows, { onConflict: "league_id,week,team_id" });
        if (upsertError) throw new Error(`matchups upsert: ${upsertError.message}`);
        matchupCount += rows.length;
      }
    }

    await db
      .from("leagues")
      .update({ synced_at: new Date().toISOString() })
      .eq("id", league.id);
  }

  return {
    leagues: leagues.length,
    matchups: matchupCount,
    weeks: weekCount,
    games: gameState.gameCount,
    game_state_errors: gameState.errorCount,
  };
}

async function syncGameStates(
  db: Db,
  adapter: PlatformAdapter,
  season: number,
  weeks: number[],
  ownerId: string | null
): Promise<{ gameCount: number; errorCount: number; finalWeeks: Set<number> }> {
  const finalWeeks = new Set<number>();
  let gameCount = 0;
  let errorCount = 0;

  if (!adapter.getGameState) return { gameCount, errorCount, finalWeeks };

  for (const week of weeks) {
    try {
      const games = await adapter.getGameState(SPORT, season, week);
      if (games.length) {
        const { error } = await db.from("nfl_games").upsert(
          games.map((game) => ({
            game_id: game.gameId,
            season: game.season,
            week: game.week,
            season_type: game.seasonType,
            start_time: game.startTime,
            status: game.status,
            home_team: game.homeTeam,
            away_team: game.awayTeam,
            is_over: game.isOver,
            in_progress: game.inProgress,
            canceled: game.canceled,
            quarter: game.quarter,
            raw: game.raw as Json,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: "game_id" }
        );
        if (error) throw new Error(`nfl_games upsert: ${error.message}`);
        gameCount += games.length;
        const active = games.filter((game) => !game.canceled);
        if (active.length && active.every((game) => game.isOver)) finalWeeks.add(week);
      }
    } catch (err) {
      errorCount++;
      const message = err instanceof Error ? err.message : String(err);
      await db.from("sync_runs").insert({
        owner_id: ownerId,
        platform: adapter.platform,
        status: "error",
        finished_at: new Date().toISOString(),
        error: `game state week ${week}: ${message}`,
        stats: { week } as Json,
      });
    }
  }

  return { gameCount, errorCount, finalWeeks };
}

// ---------- upsert helpers ----------

async function upsertLeague(
  db: Db,
  platform: Platform,
  league: CanonicalLeague,
  ownerId: string | null
): Promise<string> {
  const { data, error } = await db
    .from("leagues")
    .upsert(
      {
        owner_id: ownerId,
        platform,
        external_id: league.externalId,
        sport: league.sport,
        season: league.season,
        name: league.name,
        team_count: league.teamCount,
        scoring_type: league.scoringType,
        format: league.format,
        league_type: league.leagueType,
        scoring_raw: league.scoringRaw as Json,
        roster_slots: league.rosterSlots as Json,
        current_week: league.currentWeek,
        status: league.status,
      },
      { onConflict: "owner_id,platform,external_id,season" }
    )
    .select("id")
    .single();

  if (error || !data) throw new Error(`leagues upsert: ${error?.message}`);
  return data.id;
}

async function upsertTeams(
  db: Db,
  leagueId: string,
  teams: CanonicalTeam[]
): Promise<Map<string, string>> {
  const { data, error } = await db
    .from("teams")
    .upsert(
      teams.map((t) => ({
        league_id: leagueId,
        external_id: t.externalId,
        name: t.name,
        manager_name: t.managerName,
        avatar_url: t.avatarUrl,
        is_mine: t.isMine,
        wins: t.record.wins,
        losses: t.record.losses,
        ties: t.record.ties,
        points_for: t.pointsFor,
        points_against: t.pointsAgainst,
        standing: t.standing,
      })),
      { onConflict: "league_id,external_id" }
    )
    .select("id, external_id");

  if (error) throw new Error(`teams upsert: ${error.message}`);
  return new Map((data ?? []).map((t) => [t.external_id, t.id]));
}
