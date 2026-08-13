export interface StarterGame {
  leagueId: string;
  teamId: string;
  isMine: boolean;
  startTime: string | null;
  isOver: boolean;
  inProgress: boolean;
  canceled: boolean;
  quarter: string | null;
  projectedPoints: number | null;
}

export type DotState = "played" | "live" | "upcoming";

export interface GameWindow {
  startTime: string;
  label: string;
  dots: DotState[];
}

export interface LeftToPlay {
  total: number;
  remaining: number;
  played: number;
  live: number;
  unassigned: number;
  windows: GameWindow[];
}

export function formatGameWindow(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function easternDateKey(value: string | number | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function buildLeftToPlay(rows: StarterGame[], now: string | number | Date = new Date()): LeftToPlay {
  const today = easternDateKey(now);
  const owned = rows.filter((row) => row.isMine);
  const hasGamesToday = owned.some(
    (row) => row.startTime && !row.canceled && easternDateKey(row.startTime) === today
  );
  const mine = hasGamesToday
    ? owned.filter(
        (row) => !row.startTime || row.canceled || easternDateKey(row.startTime) === today
      )
    : [];
  const byStart = new Map<string, DotState[]>();
  let played = 0;
  let live = 0;
  let remaining = 0;
  let unassigned = 0;

  for (const row of mine) {
    if (!row.startTime || row.canceled) {
      unassigned++;
      continue;
    }
    const state: DotState = row.isOver ? "played" : row.inProgress ? "live" : "upcoming";
    if (state === "played") played++;
    if (state === "live") live++;
    if (state === "upcoming") remaining++;
    const dots = byStart.get(row.startTime) ?? [];
    dots.push(state);
    byStart.set(row.startTime, dots);
  }

  const windows = [...byStart.entries()]
    .sort(([a], [b]) => Date.parse(a) - Date.parse(b))
    .map(([startTime, dots]) => ({ startTime, label: formatGameWindow(startTime), dots }));

  return { total: mine.length, remaining, played, live, unassigned, windows };
}

function remainingFraction(row: StarterGame): number {
  if (row.canceled || row.isOver || !row.startTime) return 0;
  if (!row.inProgress) return 1;
  const quarter = row.quarter?.toUpperCase() ?? "";
  if (quarter.includes("HALF")) return 0.5;
  if (quarter.includes("OT")) return 0.05;
  const number = Number(quarter.replace(/\D/g, ""));
  if (number === 1) return 0.75;
  if (number === 2) return 0.5;
  if (number === 3) return 0.25;
  if (number >= 4) return 0.1;
  return 0.5;
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

function sideForecast(points: number, rows: StarterGame[]) {
  let mean = points;
  let variance = 0;
  let remaining = 0;

  for (const row of rows) {
    const fraction = remainingFraction(row);
    if (fraction === 0) continue;
    remaining++;
    if (row.projectedPoints === null) return null;
    mean += row.projectedPoints * fraction;
    const playerSigma = Math.max(3, row.projectedPoints * 0.45);
    variance += playerSigma * playerSigma * fraction;
  }

  return { mean, variance, remaining };
}

export function winProbability(
  minePoints: number,
  opponentPoints: number,
  mineRows: StarterGame[],
  opponentRows: StarterGame[],
  isFinal: boolean
): number | null {
  if (isFinal) return minePoints === opponentPoints ? 50 : minePoints > opponentPoints ? 100 : 0;
  if (!mineRows.length || !opponentRows.length) return null;

  const mine = sideForecast(minePoints, mineRows);
  const opponent = sideForecast(opponentPoints, opponentRows);
  if (!mine || !opponent) return null;

  const variance = mine.variance + opponent.variance;
  if (variance === 0) {
    return mine.mean === opponent.mean ? 50 : mine.mean > opponent.mean ? 100 : 0;
  }

  return Math.round(normalCdf((mine.mean - opponent.mean) / Math.sqrt(variance)) * 100);
}

export function remainingStarters(rows: StarterGame[]): number {
  return rows.filter((row) => remainingFraction(row) > 0).length;
}
