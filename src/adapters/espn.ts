import type {
  CanonicalLeague,
  CanonicalMatchup,
  CanonicalRosterEntry,
  CanonicalTeam,
} from "./types";
import type { EspnLeagueSnapshot } from "@/connector/protocol";

export interface CanonicalEspnSnapshot {
  league: CanonicalLeague;
  teams: CanonicalTeam[];
  rosters: CanonicalRosterEntry[];
  matchups: CanonicalMatchup[];
}

/** ESPN-shaped data ends here; persistence receives only canonical DTOs. */
export function normalizeEspnSnapshot(snapshot: EspnLeagueSnapshot): CanonicalEspnSnapshot {
  const rosterPositions = Object.entries(snapshot.rosterSlots).flatMap(([slot, count]) =>
    Array.from({ length: count }, () => slot)
  );
  const teams: CanonicalTeam[] = snapshot.teams.map((team) => ({
    externalId: team.id,
    name: team.name,
    managerName: team.managerName,
    avatarUrl: null,
    isMine: team.id === snapshot.myTeamId,
    record: { wins: team.wins, losses: team.losses, ties: team.ties },
    pointsFor: team.pointsFor ?? 0,
    pointsAgainst: team.pointsAgainst ?? 0,
    standing: team.standing,
  }));
  const rosters: CanonicalRosterEntry[] = snapshot.teams.flatMap((team) =>
    team.roster.map((player, lineupOrder) => ({
      teamExternalId: team.id,
      externalPlayerId: player.id,
      slot: player.lineupSlot,
      isStarter: !["BN", "IR"].includes(player.lineupSlot),
      lineupOrder,
      week: snapshot.currentWeek,
      playerRef: {
        externalId: player.id,
        fullName: player.name,
        position: player.position,
        teamAbbr: player.proTeam,
      },
    }))
  );
  const matchups: CanonicalMatchup[] = snapshot.matchups.flatMap((game) => {
    const sides = [
      {
        teamExternalId: game.homeTeamId,
        opponentExternalId: game.awayTeamId,
        points: game.homePoints,
        projectedPoints: game.homeProjected,
      },
      {
        teamExternalId: game.awayTeamId,
        opponentExternalId: game.homeTeamId,
        points: game.awayPoints,
        projectedPoints: game.awayProjected,
      },
    ];
    return sides.flatMap((side): CanonicalMatchup[] => side.teamExternalId ? [{
      week: game.week,
      matchupKey: game.id,
      teamExternalId: side.teamExternalId,
      opponentExternalId: side.opponentExternalId,
      points: side.points,
      projectedPoints: side.projectedPoints,
      isFinal: game.isFinal,
    }] : []);
  });

  return {
    league: {
      externalId: snapshot.leagueId,
      sport: "nfl",
      season: snapshot.season,
      name: snapshot.name,
      teamCount: snapshot.teamCount,
      scoringType: "custom",
      scoringRaw: { source: "espn_connector", roster_positions: rosterPositions },
      rosterSlots: snapshot.rosterSlots,
      currentWeek: snapshot.currentWeek,
      status: snapshot.status,
      format: "head_to_head",
      leagueType: "redraft",
    },
    teams,
    rosters,
    matchups,
  };
}
