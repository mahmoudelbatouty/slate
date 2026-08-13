export type LeagueFormat = "head_to_head" | "chopped";

/** Sleeper currently identifies its native Chopped format with settings.type 3. */
export function sleeperLeagueFormat(settings: unknown): LeagueFormat {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return "head_to_head";
  }
  return (settings as Record<string, unknown>).type === 3 ? "chopped" : "head_to_head";
}

export interface ChoppedStanding {
  teamId: string;
  name: string;
  points: number | null;
  projected: number | null;
  isMine: boolean;
}

export interface ChoppedSummary {
  standings: ChoppedStanding[];
  myRank: number | null;
  chopZone: ChoppedStanding | null;
  marginAboveChop: number | null;
}

/** Chopping Block order: lowest projected finish first, matching Sleeper. */
export function choppedSummary(entries: ChoppedStanding[]): ChoppedSummary {
  const score = (entry: ChoppedStanding) => entry.projected ?? entry.points;
  const standings = entries
    .filter((entry) => score(entry) !== null)
    .toSorted((a, b) => score(a)! - score(b)! || a.name.localeCompare(b.name));
  const mine = standings.find((entry) => entry.isMine) ?? null;
  const chopZone = standings[0] ?? null;
  const mineScore = mine ? score(mine) : null;
  const chopScore = chopZone ? score(chopZone) : null;

  return {
    standings,
    myRank: mine ? standings.length - standings.indexOf(mine) : null,
    chopZone,
    marginAboveChop: mineScore !== null && chopScore !== null
      ? Math.round((mineScore - chopScore) * 10) / 10
      : null,
  };
}
