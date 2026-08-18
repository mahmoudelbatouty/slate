import "server-only";

import { db } from "@/db/client";
import type { ConnectorEnvelope } from "./protocol";
import { nativeProjections } from "./protocol";
import { normalizeEspnSnapshot } from "@/adapters/espn";
import { buildIndex, runSync } from "@/sync/run";
import type { Json } from "@/db/types.gen";

export async function storeConnectorCapture(
  installationId: string,
  ownerId: string,
  envelope: ConnectorEnvelope
): Promise<{ updated: number }> {
  const client = db();
  const projections = nativeProjections(envelope);
  if (envelope.platform === "sleeper" && envelope.kind === "account_identity") {
    const { error: accountError } = await client.from("platform_accounts").upsert({
      owner_id: ownerId,
      platform: "sleeper",
      external_user_id: envelope.userId,
      username: null,
      secrets: {},
      last_ok_at: null,
    }, { onConflict: "owner_id,platform" });
    if (accountError) throw new Error(`Sleeper account save: ${accountError.message}`);

    const configuredSeason = Number(process.env.DEFAULT_SEASON);
    const season = Number.isInteger(configuredSeason) && configuredSeason >= 2000
      ? configuredSeason
      : new Date().getFullYear();
    const results = await runSync(client, "account", season, ["sleeper"], ownerId);
    const result = results[0];
    if (!result || result.status !== "ok") {
      throw new Error(result?.error ?? "Sleeper account sync did not run");
    }

    const { error: seenError } = await client
      .from("connector_installations")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", installationId)
      .eq("owner_id", ownerId);
    if (seenError) throw new Error(`connector heartbeat: ${seenError.message}`);
    return { updated: result.stats.leagues ?? 0 };
  }
  if (envelope.platform === "espn") {
    for (const snapshot of envelope.snapshots) {
      const { error } = await client.from("connector_captures").upsert({
        installation_id: installationId,
        platform: envelope.platform,
        kind: envelope.kind,
        external_league_id: snapshot.leagueId,
        week: snapshot.currentWeek,
        payload: snapshot,
        captured_at: envelope.capturedAt,
        received_at: new Date().toISOString(),
      }, { onConflict: "installation_id,platform,kind,external_league_id,week" });
      if (error) throw new Error(`connector capture write: ${error.message}`);
      await storeEspnCanonical(client, ownerId, snapshot, envelope.capturedAt);
    }
    const { error: seenError } = await client
      .from("connector_installations")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", installationId);
    if (seenError) throw new Error(`connector heartbeat: ${seenError.message}`);
    return { updated: envelope.snapshots.length };
  }

  const captureGroups = new Map<string, typeof envelope.matchups>();

  for (const row of envelope.matchups) {
    const key = `${row.league_id}:${row.round}`;
    const group = captureGroups.get(key) ?? [];
    group.push(row);
    captureGroups.set(key, group);
  }

  for (const [key, matchups] of captureGroups) {
    const [externalLeagueId, weekText] = key.split(":");
    const { error } = await client.from("connector_captures").upsert(
      {
        installation_id: installationId,
        platform: envelope.platform,
        kind: envelope.kind,
        external_league_id: externalLeagueId,
        week: Number(weekText),
        payload: matchups,
        captured_at: envelope.capturedAt,
        received_at: new Date().toISOString(),
      },
      {
        onConflict: "installation_id,platform,kind,external_league_id,week",
      }
    );
    if (error) throw new Error(`connector capture write: ${error.message}`);
  }

  if (projections.length > 0) {
    const { error: projectionError } = await client.from("native_projections").upsert(
      projections.map((projection) => ({
        installation_id: installationId,
        owner_id: ownerId,
        platform: envelope.platform,
        external_league_id: projection.externalLeagueId,
        external_team_id: projection.externalTeamId,
        week: projection.week,
        projected_points: projection.projectedPoints,
        captured_at: envelope.capturedAt,
      })),
      { onConflict: "owner_id,platform,external_league_id,external_team_id,week" }
    );
    if (projectionError) {
      throw new Error(`native projection write: ${projectionError.message}`);
    }
  }

  // Also update the sync cache immediately. The canonical override above is
  // the durable source and prevents later scheduled syncs from winning.
  let updated = 0;
  const byLeague = new Map<string, typeof projections>();
  for (const projection of projections) {
    const group = byLeague.get(projection.externalLeagueId) ?? [];
    group.push(projection);
    byLeague.set(projection.externalLeagueId, group);
  }

  for (const [externalLeagueId, rows] of byLeague) {
    const { data: league, error: leagueError } = await client
      .from("leagues")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("platform", envelope.platform)
      .eq("external_id", externalLeagueId)
      .maybeSingle();

    if (leagueError) throw new Error(`connector league read: ${leagueError.message}`);
    if (!league) continue;

    const { data: teams, error: teamError } = await client
      .from("teams")
      .select("id, external_id")
      .eq("league_id", league.id);
    if (teamError) throw new Error(`connector teams read: ${teamError.message}`);

    const teamIds = new Map((teams ?? []).map((team) => [team.external_id, team.id]));
    for (const projection of rows) {
      const teamId = teamIds.get(projection.externalTeamId);
      if (!teamId) continue;

      const { error: updateError } = await client
        .from("matchups")
        .update({ projected_points: projection.projectedPoints })
        .eq("league_id", league.id)
        .eq("week", projection.week)
        .eq("team_id", teamId);
      if (updateError) throw new Error(`connector matchup update: ${updateError.message}`);
      updated++;
    }
  }

  const { error: seenError } = await client
    .from("connector_installations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", installationId);
  if (seenError) throw new Error(`connector heartbeat: ${seenError.message}`);

  return { updated };
}

async function storeEspnCanonical(
  client: ReturnType<typeof db>,
  ownerId: string,
  snapshot: Extract<ConnectorEnvelope, { platform: "espn" }>["snapshots"][number],
  capturedAt: string
): Promise<void> {
  const canonical = normalizeEspnSnapshot(snapshot);
  const { data: league, error: leagueError } = await client.from("leagues").upsert({
    owner_id: ownerId,
    platform: "espn",
    external_id: canonical.league.externalId,
    sport: canonical.league.sport,
    season: canonical.league.season,
    name: canonical.league.name,
    team_count: canonical.league.teamCount,
    scoring_type: canonical.league.scoringType,
    scoring_raw: canonical.league.scoringRaw as Json,
    roster_slots: canonical.league.rosterSlots as Json,
    current_week: canonical.league.currentWeek,
    status: canonical.league.status,
    format: canonical.league.format,
    league_type: canonical.league.leagueType,
    synced_at: capturedAt,
  }, { onConflict: "owner_id,platform,external_id,season" }).select("id").single();
  if (leagueError || !league) throw new Error(`ESPN league upsert: ${leagueError?.message}`);

  const { data: teams, error: teamError } = await client.from("teams").upsert(
    canonical.teams.map((team) => ({
      league_id: league.id,
      external_id: team.externalId,
      name: team.name,
      manager_name: team.managerName,
      avatar_url: team.avatarUrl,
      is_mine: team.isMine,
      wins: team.record.wins,
      losses: team.record.losses,
      ties: team.record.ties,
      points_for: team.pointsFor,
      points_against: team.pointsAgainst,
      standing: team.standing,
    })),
    { onConflict: "league_id,external_id" }
  ).select("id, external_id");
  if (teamError) throw new Error(`ESPN teams upsert: ${teamError.message}`);
  const teamIds = new Map((teams ?? []).map((team) => [team.external_id, team.id]));

  const { data: existingLinks, error: linkReadError } = await client
    .from("player_ids")
    .select("external_id, player_id")
    .eq("platform", "espn");
  if (linkReadError) throw new Error(`ESPN player links read: ${linkReadError.message}`);
  const playerIds = new Map((existingLinks ?? []).map((row) => [row.external_id, row.player_id]));
  const crosswalk = await buildIndex(client);
  const newLinks = canonical.rosters.flatMap((entry) => {
    if (playerIds.has(entry.externalPlayerId) || !entry.playerRef) return [];
    const match = crosswalk.match(entry.playerRef);
    if (!match) return [];
    playerIds.set(entry.externalPlayerId, match.playerId);
    return [{ platform: "espn" as const, external_id: entry.externalPlayerId, player_id: match.playerId, confidence: match.confidence }];
  });
  if (newLinks.length) {
    const { error } = await client.from("player_ids").upsert(newLinks, { onConflict: "platform,external_id" });
    if (error) throw new Error(`ESPN player links upsert: ${error.message}`);
  }

  if (canonical.rosters.length) {
    const ids = [...teamIds.values()];
    const { error: clearError } = await client.from("roster_entries").delete()
      .in("team_id", ids)
      .eq("week", snapshot.currentWeek);
    if (clearError) throw new Error(`ESPN roster clear: ${clearError.message}`);
    const playerStats = new Map(snapshot.teams.flatMap((team) =>
      team.roster.map((player) => [`${team.id}:${player.id}`, player] as const)
    ));
    const rows = canonical.rosters.flatMap((entry) => {
      const teamId = teamIds.get(entry.teamExternalId);
      if (!teamId) return [];
      const stats = playerStats.get(`${entry.teamExternalId}:${entry.externalPlayerId}`);
      return [{
        team_id: teamId,
        player_id: playerIds.get(entry.externalPlayerId) ?? null,
        external_player_id: entry.externalPlayerId,
        slot: entry.slot,
        is_starter: entry.isStarter,
        lineup_order: entry.lineupOrder,
        week: entry.week,
        current_points: stats?.currentPoints ?? null,
        projected_points: stats?.projectedPoints ?? null,
      }];
    });
    const { error: rosterError } = await client.from("roster_entries").insert(rows);
    if (rosterError) throw new Error(`ESPN roster insert: ${rosterError.message}`);
  }

  if (canonical.matchups.length) {
    const rows = canonical.matchups.flatMap((matchup) => {
      const teamId = teamIds.get(matchup.teamExternalId);
      if (!teamId) return [];
      return [{
        league_id: league.id,
        week: matchup.week,
        matchup_key: matchup.matchupKey,
        team_id: teamId,
        opponent_team_id: matchup.opponentExternalId ? teamIds.get(matchup.opponentExternalId) ?? null : null,
        points: matchup.points,
        projected_points: matchup.projectedPoints,
        is_final: matchup.isFinal,
      }];
    });
    const { error: matchupError } = await client.from("matchups").upsert(rows, { onConflict: "league_id,week,team_id" });
    if (matchupError) throw new Error(`ESPN matchups upsert: ${matchupError.message}`);
  }
}
