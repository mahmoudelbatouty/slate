(() => {
  "use strict";

  const API_HOST = "lm-api-reads.fantasy.espn.com";
  const LEAGUE_PATH = /^\/apis\/v3\/games\/ffl\/seasons\/(\d{4})\/segments\/0\/leagues\/(\d+)$/;
  const VIEWS = ["mTeam", "mRoster", "mMatchup", "mMatchupScore", "mSettings"];
  const POSITION = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DEF" };
  const SLOT = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "DEF", 17: "K", 20: "BN", 21: "IR", 23: "FLEX", 25: "SFLX" };
  const PRO_TEAM = { 0: "FA", 1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN", 8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR", 15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI", 22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WAS", 29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU" };

  function numericId(value) {
    return typeof value === "string" && /^\d+$/.test(value) ? value : null;
  }

  function normalizeLeagueRef(value) {
    if (!value || typeof value !== "object") return null;
    const leagueId = numericId(value.leagueId);
    const teamId = value.teamId == null ? null : numericId(value.teamId);
    if (!leagueId || (value.teamId != null && !teamId)) return null;
    if (!Number.isInteger(value.season) || value.season < 2000 || value.season > 2100) return null;
    return { leagueId, season: value.season, teamId };
  }

  function buildLeagueUrl(value) {
    const league = normalizeLeagueRef(value);
    if (!league) return null;
    const url = new URL(`https://${API_HOST}/apis/v3/games/ffl/seasons/${league.season}/segments/0/leagues/${league.leagueId}`);
    if (league.teamId) url.searchParams.set("teamId", league.teamId);
    VIEWS.forEach((view) => url.searchParams.append("view", view));
    return url.href;
  }

  function finite(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function points(player, week, source) {
    const rows = Array.isArray(player?.stats) ? player.stats : [];
    return finite(rows.find((row) => row?.scoringPeriodId === week && row?.statSourceId === source)?.appliedTotal);
  }

  function sanitizePlayer(entry, week) {
    const player = entry?.playerPoolEntry?.player;
    if (!player || !Number.isFinite(player.id) || typeof player.fullName !== "string") return null;
    return {
      id: String(player.id),
      name: player.fullName.slice(0, 160),
      position: POSITION[player.defaultPositionId] ?? null,
      proTeam: PRO_TEAM[player.proTeamId] ?? null,
      lineupSlot: SLOT[entry.lineupSlotId] ?? `S${Number.isFinite(entry.lineupSlotId) ? entry.lineupSlotId : "?"}`,
      injuryStatus: typeof player.injuryStatus === "string" ? player.injuryStatus.slice(0, 32) : null,
      currentPoints: points(player, week, 0),
      projectedPoints: points(player, week, 1),
    };
  }

  function sideProjection(side) {
    return finite(side?.totalProjectedPointsLive) ?? finite(side?.totalProjectedPoints);
  }

  function sanitizeResponse(json, value) {
    const league = normalizeLeagueRef(value);
    const url = buildLeagueUrl(value);
    const parsed = url ? new URL(url) : null;
    const pathMatch = parsed?.hostname === API_HOST ? parsed.pathname.match(LEAGUE_PATH) : null;
    if (!league || !pathMatch || !json || !Array.isArray(json.teams)) return null;

    const responseLeagueId = String(json.id ?? league.leagueId);
    const season = Number(json.seasonId ?? league.season);
    const currentWeek = Number(json.scoringPeriodId ?? json.status?.currentMatchupPeriod);
    if (responseLeagueId !== league.leagueId || season !== league.season || !Number.isInteger(currentWeek)) return null;
    const members = new Map((json.members ?? []).map((member) => [member.id, member.displayName ?? [member.firstName, member.lastName].filter(Boolean).join(" ")]));
    const teams = json.teams.slice(0, 32).flatMap((team) => {
      if (!Number.isFinite(team?.id)) return [];
      const record = team.record?.overall ?? {};
      return [{
        id: String(team.id),
        name: String(team.name ?? team.abbrev ?? `Team ${team.id}`).slice(0, 160),
        abbreviation: typeof team.abbrev === "string" ? team.abbrev.slice(0, 16) : null,
        managerName: members.get(team.primaryOwner) ?? null,
        wins: Math.max(0, Math.trunc(record.wins ?? 0)),
        losses: Math.max(0, Math.trunc(record.losses ?? 0)),
        ties: Math.max(0, Math.trunc(record.ties ?? 0)),
        pointsFor: finite(record.pointsFor),
        pointsAgainst: finite(record.pointsAgainst),
        standing: Number.isInteger(team.rankCalculatedFinal) && team.rankCalculatedFinal > 0 ? team.rankCalculatedFinal : null,
        roster: (team.roster?.entries ?? []).slice(0, 100).map((entry) => sanitizePlayer(entry, currentWeek)).filter(Boolean),
      }];
    });
    if (!teams.length) return null;
    const schedule = Array.isArray(json.schedule) ? json.schedule : [];
    const matchups = schedule.slice(0, 500).flatMap((game) => {
      const week = Number(game.matchupPeriodId);
      if (!Number.isInteger(week) || week < 1 || week > 25) return [];
      return [{
        id: String(game.id),
        week,
        isFinal: game.winner === "HOME" || game.winner === "AWAY" || game.winner === "TIE",
        homeTeamId: Number.isFinite(game.home?.teamId) ? String(game.home.teamId) : null,
        awayTeamId: Number.isFinite(game.away?.teamId) ? String(game.away.teamId) : null,
        homePoints: finite(game.home?.totalPoints),
        awayPoints: finite(game.away?.totalPoints),
        homeProjected: sideProjection(game.home),
        awayProjected: sideProjection(game.away),
      }];
    });
    const drafted = json.draftDetail?.drafted;
    return {
      leagueId: responseLeagueId,
      season,
      name: String(json.settings?.name ?? `ESPN League ${league.leagueId}`).slice(0, 200),
      teamCount: Math.min(32, Math.max(1, Math.trunc(json.settings?.size ?? teams.length))),
      currentWeek: Math.min(25, Math.max(1, currentWeek)),
      status: drafted === false
        ? "pre_draft"
        : json.status?.isActive === false
          ? "complete"
          : schedule.length
            ? "in_season"
            : "pre_draft",
      myTeamId: league.teamId && teams.some((team) => team.id === league.teamId) ? league.teamId : null,
      rosterSlots: Object.fromEntries(Object.entries(json.settings?.rosterSettings?.lineupSlotCounts ?? {}).filter(([, count]) => Number.isInteger(count) && count >= 0 && count <= 30).map(([slot, count]) => [SLOT[slot] ?? `S${slot}`, count])),
      teams,
      matchups,
    };
  }

  self.SlateEspnBackground = Object.freeze({
    buildLeagueUrl,
    normalizeLeagueRef,
    sanitizeResponse,
  });
})();
