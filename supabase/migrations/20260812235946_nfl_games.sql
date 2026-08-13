create table public.nfl_games (
  game_id       text primary key,
  season        int not null,
  week          int not null,
  season_type   text not null,
  start_time    timestamptz,
  status        text,
  home_team     text,
  away_team     text,
  is_over       boolean not null default false,
  in_progress   boolean not null default false,
  canceled      boolean not null default false,
  quarter       text,
  raw           jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create index nfl_games_season_week_idx on public.nfl_games (season, week);
create index nfl_games_start_time_idx on public.nfl_games (start_time);

alter table public.nfl_games enable row level security;

alter table public.roster_entries
  add column current_points numeric(10,2),
  add column projected_points numeric(10,2);

create view public.starter_game_state
with (security_invoker = true)
as
select
  l.id as league_id,
  l.season,
  re.week,
  t.id as team_id,
  t.is_mine,
  re.external_player_id,
  re.slot,
  re.current_points,
  re.projected_points,
  p.full_name,
  p.position,
  p.team_abbr,
  g.game_id,
  g.start_time,
  g.status,
  g.is_over,
  g.in_progress,
  g.canceled,
  g.quarter
from public.roster_entries re
join public.teams t on t.id = re.team_id
join public.leagues l on l.id = t.league_id
left join public.players p on p.id = re.player_id
left join public.nfl_games g
  on g.season = l.season
 and g.week = re.week
 and (g.home_team = p.team_abbr or g.away_team = p.team_abbr)
where re.is_starter;

revoke all on public.starter_game_state from anon, authenticated;
grant select on public.starter_game_state to service_role;
