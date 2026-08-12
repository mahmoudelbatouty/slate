-- ============================================================
-- Fantasy Hub — canonical schema (Supabase / Postgres)
-- Personal use: single owner, no RLS yet. Add RLS + owner_id
-- filters later if this ever goes multi-user.
-- ============================================================

create type platform as enum ('sleeper', 'espn', 'yahoo');
create type sport    as enum ('nfl', 'nba', 'mlb', 'nhl');

-- ------------------------------------------------------------
-- 1. Credentials — one row per platform, just for you.
--    Sleeper: no creds, username only.
--    Yahoo:   client_id/secret in env; refresh_token lives here.
--    ESPN:    espn_s2 + SWID pasted from browser cookies.
-- ------------------------------------------------------------
create table platform_accounts (
  id            uuid primary key default gen_random_uuid(),
  platform      platform not null unique,
  external_user_id text,               -- sleeper user_id, yahoo guid, espn SWID
  username      text,
  secrets       jsonb not null default '{}'::jsonb,
  expires_at    timestamptz,           -- yahoo access token expiry / espn cookie guess
  last_ok_at    timestamptz,           -- last successful call; drives "reconnect" banner
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Player crosswalk — the spine of the whole thing.
--    Sleeper's player dump is the canonical source; ESPN and
--    Yahoo IDs map into it. Match on gsis_id / sportradar_id
--    first, name+team+pos fuzzy only as a fallback.
-- ------------------------------------------------------------
create table players (
  id            uuid primary key default gen_random_uuid(),
  sport         sport not null,
  full_name     text not null,
  first_name    text,
  last_name     text,
  position      text,
  team_abbr     text,
  status        text,                  -- Active, IR, Out, etc.
  gsis_id       text,
  sportradar_id text,
  updated_at    timestamptz not null default now()
);
create index on players (sport, position, team_abbr);
create index on players (lower(full_name));

create table player_ids (
  player_id     uuid not null references players(id) on delete cascade,
  platform      platform not null,
  external_id   text not null,
  confidence    real not null default 1.0,  -- <1.0 = fuzzy-matched, review it
  primary key (platform, external_id)
);
create index on player_ids (player_id);

-- ------------------------------------------------------------
-- 3. Leagues
-- ------------------------------------------------------------
create table leagues (
  id            uuid primary key default gen_random_uuid(),
  platform      platform not null,
  external_id   text not null,
  sport         sport not null,
  season        int not null,
  name          text not null,
  team_count    int,
  scoring_type  text,                  -- 'ppr' | 'half_ppr' | 'standard' | 'custom'
  scoring_raw   jsonb,                 -- untouched platform settings blob
  roster_slots  jsonb,                 -- normalized: {"QB":1,"RB":2,"FLEX":1,...}
  current_week  int,
  status        text,                  -- pre_draft | in_season | complete
  synced_at     timestamptz,
  unique (platform, external_id, season)
);

-- ------------------------------------------------------------
-- 4. Teams (a manager's team within a league)
-- ------------------------------------------------------------
create table teams (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  external_id   text not null,         -- sleeper roster_id, espn teamId, yahoo team_key
  name          text,
  manager_name  text,
  avatar_url    text,
  is_mine       boolean not null default false,  -- drives the "my teams" dashboard
  wins          int default 0,
  losses        int default 0,
  ties          int default 0,
  points_for    numeric(10,2) default 0,
  points_against numeric(10,2) default 0,
  standing      int,
  unique (league_id, external_id)
);
create index on teams (is_mine) where is_mine;

-- ------------------------------------------------------------
-- 5. Roster slots — current state, replaced wholesale each sync
-- ------------------------------------------------------------
create table roster_entries (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references teams(id) on delete cascade,
  player_id     uuid references players(id),
  external_player_id text not null,    -- keep raw id even if crosswalk fails
  slot          text,                  -- QB, RB, FLEX, BN, IR
  is_starter    boolean not null default false,
  week          int,
  unique (team_id, external_player_id, week)
);

-- ------------------------------------------------------------
-- 6. Matchups — one row per team per week (two rows per game)
-- ------------------------------------------------------------
create table matchups (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  week          int not null,
  matchup_key   text not null,         -- pairs the two rows together
  team_id       uuid not null references teams(id) on delete cascade,
  opponent_team_id uuid references teams(id),
  points        numeric(10,2),
  projected_points numeric(10,2),
  is_final      boolean not null default false,
  unique (league_id, week, team_id)
);
create index on matchups (league_id, week);

-- ------------------------------------------------------------
-- 7. Transactions — waivers, trades, adds/drops
-- ------------------------------------------------------------
create table transactions (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references leagues(id) on delete cascade,
  external_id   text not null,
  type          text not null,         -- add | drop | trade | waiver
  week          int,
  occurred_at   timestamptz,
  payload       jsonb not null,        -- normalized adds/drops/picks
  unique (league_id, external_id)
);

-- ------------------------------------------------------------
-- 8. Sync log — you will need this the first time ESPN breaks
-- ------------------------------------------------------------
create table sync_runs (
  id            uuid primary key default gen_random_uuid(),
  platform      platform not null,
  league_id     uuid references leagues(id) on delete set null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running',  -- running | ok | error
  error         text,
  stats         jsonb                  -- {"players":412,"matchups":12}
);
create index on sync_runs (platform, started_at desc);

-- ------------------------------------------------------------
-- Convenience view: this week across every league
-- ------------------------------------------------------------
create view my_week as
select l.platform, l.name as league, l.season, m.week,
       t.name as my_team, m.points, m.projected_points,
       o.name as opponent, om.points as opponent_points, m.is_final
from matchups m
join teams t   on t.id = m.team_id and t.is_mine
join leagues l on l.id = m.league_id
left join teams o    on o.id = m.opponent_team_id
left join matchups om on om.team_id = m.opponent_team_id
                     and om.week = m.week
                     and om.league_id = m.league_id
where m.week = l.current_week;
