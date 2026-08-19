/**
 * "Around the league" — the real NFL games behind the fantasy week. The rows
 * come from `nfl_games`, which the sync job already fills for starter state, so
 * this costs the dashboard nothing extra.
 *
 * Scores are read out of the stored provider blob rather than a column: the
 * game-state feed is undocumented and may stop sending them, and a missing
 * score has to degrade to a dash instead of hiding the game.
 */

export interface NflGameRow {
  gameId: string;
  homeTeam: string | null;
  awayTeam: string | null;
  startTime: string | null;
  status: string | null;
  isOver: boolean;
  inProgress: boolean;
  canceled: boolean;
  quarter: string | null;
  raw: unknown;
}

export type GamePhase = "live" | "final" | "upcoming";

export interface NflGameBox {
  gameId: string;
  home: string;
  away: string;
  homePoints: number | null;
  awayPoints: number | null;
  status: string;
  phase: GamePhase;
  /** Null before kickoff — neither side leads a game nobody has played. */
  leader: "home" | "away" | null;
}

export function buildScoreboard(rows: NflGameRow[]): NflGameBox[] {
  return rows
    .filter((row) => !row.canceled && (row.homeTeam || row.awayTeam))
    .map(toBox)
    .sort(byPhase);
}

/** "2 LIVE · 1 FINAL · 11 TO PLAY", dropping whichever counts are zero. */
export function scoreboardSummary(games: NflGameBox[]): string {
  const live = games.filter((game) => game.phase === "live").length;
  const final = games.filter((game) => game.phase === "final").length;
  const upcoming = games.filter((game) => game.phase === "upcoming").length;
  const parts = [
    live > 0 ? `${live} LIVE` : null,
    final > 0 ? `${final} FINAL` : null,
    upcoming > 0 ? `${upcoming} TO PLAY` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(" · ") : "NO GAMES SYNCED";
}

function toBox(row: NflGameRow): NflGameBox {
  const phase: GamePhase = row.inProgress ? "live" : row.isOver ? "final" : "upcoming";
  const homePoints = scoreFrom(row.raw, "home");
  const awayPoints = scoreFrom(row.raw, "away");

  return {
    gameId: row.gameId,
    home: row.homeTeam ?? "TBD",
    away: row.awayTeam ?? "TBD",
    homePoints,
    awayPoints,
    status: statusLabel(row, phase),
    phase,
    leader:
      phase === "upcoming" || homePoints === null || awayPoints === null || homePoints === awayPoints
        ? null
        : homePoints > awayPoints
          ? "home"
          : "away",
  };
}

function statusLabel(row: NflGameRow, phase: GamePhase): string {
  if (phase === "final") return "FINAL";
  if (phase === "live") {
    const clock = timeRemaining(row.raw);
    const quarter = quarterLabel(row.quarter);
    return [quarter, clock].filter(Boolean).join(" · ") || "LIVE";
  }
  return kickoffLabel(row.startTime);
}

function quarterLabel(quarter: string | null): string {
  if (!quarter) return "LIVE";
  const numeric = Number(quarter);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 4 ? "OT" : `Q${numeric}`;
  return quarter.toUpperCase();
}

export function kickoffLabel(startTime: string | null): string {
  if (!startTime) return "TBD";
  const date = new Date(startTime);
  if (Number.isNaN(date.valueOf())) return "TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })
    .format(date)
    .replace(",", "")
    .replace(/\s?(AM|PM)$/i, "")
    .toUpperCase();
}

function scoreFrom(raw: unknown, side: "home" | "away"): number | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>)[`${side}_score`];
  const numeric = typeof value === "string" ? Number(value) : value;
  return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : null;
}

function timeRemaining(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const value = (raw as Record<string, unknown>).time_remaining;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function byPhase(a: NflGameBox, b: NflGameBox): number {
  const rank = { live: 0, final: 1, upcoming: 2 } as const;
  return rank[a.phase] - rank[b.phase] || a.away.localeCompare(b.away);
}
