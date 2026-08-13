// ============================================================
// Fantasy Hub — platform adapter contract
//
// Every platform implements this same interface. The sync job
// never knows which platform it's talking to; it just loops
// over adapters and upserts whatever comes back.
//
//   src/adapters/sleeper.ts
//   src/adapters/yahoo.ts
//   src/adapters/espn.ts
// ============================================================

export type Platform = "sleeper" | "espn" | "yahoo";
export type Sport = "nfl" | "nba" | "mlb" | "nhl";

// ---------- credentials (transitional server adapter shapes) ----------
// Browser-connector sessions never enter these DTOs. Yahoo OAuth remains
// server-side; the ESPN cookie shape is legacy scaffolding to remove when its
// connector adapter lands.
export type Credentials =
  | { platform: "sleeper"; username: string }
  | { platform: "yahoo"; refreshToken: string }
  | { platform: "espn"; espnS2: string; swid: string };

// ---------- canonical DTOs (mirror the SQL tables) ----------
export interface CanonicalLeague {
  externalId: string;
  sport: Sport;
  season: number;
  name: string;
  teamCount: number;
  scoringType: "ppr" | "half_ppr" | "standard" | "custom";
  scoringRaw: unknown;              // keep the original blob, always
  rosterSlots: Record<string, number>;
  currentWeek: number | null;
  status: "pre_draft" | "in_season" | "complete";
}

export interface CanonicalTeam {
  externalId: string;
  name: string;
  managerName: string | null;
  avatarUrl: string | null;
  isMine: boolean;
  record: { wins: number; losses: number; ties: number };
  pointsFor: number;
  pointsAgainst: number;
  standing: number | null;
}

export interface CanonicalRosterEntry {
  teamExternalId: string;
  externalPlayerId: string;
  slot: string;                     // QB | RB | WR | TE | FLEX | K | DEF | BN | IR
  isStarter: boolean;
  lineupOrder: number;              // provider order within starters or bench
  week: number | null;
}

export interface CanonicalMatchup {
  week: number;
  matchupKey: string;
  teamExternalId: string;
  opponentExternalId: string | null;
  points: number | null;
  projectedPoints: number | null;
  isFinal: boolean;
  playerStats?: CanonicalPlayerStat[];
}

export interface CanonicalPlayerStat {
  externalPlayerId: string;
  isStarter: boolean;
  lineupOrder: number;
  currentPoints: number | null;
  projectedPoints: number | null;
}

export interface CanonicalGameState {
  gameId: string;
  sport: Sport;
  season: number;
  week: number;
  seasonType: string;
  startTime: string | null;
  status: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  isOver: boolean;
  inProgress: boolean;
  canceled: boolean;
  quarter: string | null;
  raw: unknown;
}

export interface CanonicalTransaction {
  externalId: string;
  type: "add" | "drop" | "trade" | "waiver";
  week: number | null;
  occurredAt: string;               // ISO
  payload: {
    adds?: { teamExternalId: string; externalPlayerId: string }[];
    drops?: { teamExternalId: string; externalPlayerId: string }[];
  };
}

// A platform's own player record, before crosswalking.
export interface CanonicalPlayerRef {
  externalId: string;
  fullName: string;
  position: string | null;
  teamAbbr: string | null;
  gsisId?: string | null;
  sportradarId?: string | null;
}

// ---------- the contract ----------
export interface PlatformAdapter {
  readonly platform: Platform;

  /** Cheap call to confirm creds still work. ESPN cookies die silently. */
  healthCheck(creds: Credentials): Promise<boolean>;

  /** Yahoo swaps refresh->access here; others no-op. */
  refreshCredentials?(creds: Credentials): Promise<Credentials>;

  listLeagues(creds: Credentials, sport: Sport, season: number): Promise<CanonicalLeague[]>;

  getTeams(creds: Credentials, leagueExternalId: string, season: number): Promise<CanonicalTeam[]>;

  getRosters(
    creds: Credentials,
    leagueExternalId: string,
    season: number,
    week?: number
  ): Promise<CanonicalRosterEntry[]>;

  getMatchups(
    creds: Credentials,
    leagueExternalId: string,
    season: number,
    week: number
  ): Promise<CanonicalMatchup[]>;

  getTransactions(
    creds: Credentials,
    leagueExternalId: string,
    season: number
  ): Promise<CanonicalTransaction[]>;

  /** Only Sleeper implements this meaningfully — it's the crosswalk spine. */
  getPlayerDirectory?(sport: Sport): Promise<CanonicalPlayerRef[]>;

  /** Shared real-life game state; one source serves every fantasy platform. */
  getGameState?(sport: Sport, season: number, week: number): Promise<CanonicalGameState[]>;
}

// ============================================================
// Implementation notes per platform
// ============================================================
//
// SLEEPER  — base https://api.sleeper.app/v1, no auth, GET only.
//   username -> /user/{name} -> user_id
//   /user/{user_id}/leagues/nfl/{season}
//   /league/{id}/rosters | /users | /matchups/{week} | /transactions/{week}
//   Player dump /players/nfl is ~5MB — fetch ONCE a day, cache it.
//   Rate limit: stay well under 1000 req/min.
//   isMine: roster.owner_id === your user_id
//
// YAHOO    — OAuth2. Store refresh_token, mint access tokens (1hr).
//   Base https://fantasysports.yahooapis.com/fantasy/v2
//   ALWAYS append ?format=json — the JSON is XML-shaped, with
//   numeric string keys and a "count" field. Write a flattener
//   helper once and never look at it again.
//   Keys look like "nfl.l.123456" (league) and "nfl.l.123456.t.4" (team).
//   Attribution required in the UI: "Fantasy data provided by Yahoo Fantasy",
//   linked back to Yahoo.
//
// ESPN     — unofficial. Base:
//   https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leagues/{id}
//   Send espn_s2 + SWID as cookies for private leagues.
//   Data is driven by ?view= params: mTeam, mRoster, mMatchup, mSettings,
//   mTransactions2. You can stack multiple views in one request.
//   Fragile: expect a 401 when cookies rotate, and treat any schema
//   change as a bug in ESPN, not in your code. Wrap every call in a
//   try/catch that writes to sync_runs and degrades gracefully —
//   the other two platforms should still render.
//
// ============================================================
// Crosswalk strategy (run after every player directory refresh)
// ============================================================
//   1. Exact match on gsis_id or sportradar_id      -> confidence 1.0
//   2. Exact normalized name + position + team      -> confidence 0.9
//   3. Normalized name + position (no team)         -> confidence 0.7
//   4. Anything below that: leave player_id NULL, surface it in an
//      /admin/unmatched page and map it by hand. There are maybe
//      20 of these per season and they're mostly defenses and
//      Jr./Sr. suffixes. Don't over-engineer it.
