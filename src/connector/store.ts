import "server-only";

import { db } from "@/db/client";
import type { ConnectorEnvelope } from "./protocol";
import { nativeProjections } from "./protocol";

export async function storeConnectorCapture(
  installationId: string,
  envelope: ConnectorEnvelope
): Promise<{ updated: number }> {
  const client = db();
  const projections = nativeProjections(envelope);
  const captureGroups = new Map<string, ConnectorEnvelope["matchups"]>();

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
        platform: envelope.platform,
        external_league_id: projection.externalLeagueId,
        external_team_id: projection.externalTeamId,
        week: projection.week,
        projected_points: projection.projectedPoints,
        captured_at: envelope.capturedAt,
      })),
      { onConflict: "platform,external_league_id,external_team_id,week" }
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
