-- Slate's browser never talks to PostgREST directly. Close every canonical
-- table to public API roles; trusted Next.js routes and sync jobs use the
-- service role and continue to work normally.
alter table platform_accounts enable row level security;
alter table players enable row level security;
alter table player_ids enable row level security;
alter table leagues enable row level security;
alter table teams enable row level security;
alter table roster_entries enable row level security;
alter table matchups enable row level security;
alter table transactions enable row level security;
alter table sync_runs enable row level security;

revoke all on platform_accounts from anon, authenticated;
revoke all on players from anon, authenticated;
revoke all on player_ids from anon, authenticated;
revoke all on leagues from anon, authenticated;
revoke all on teams from anon, authenticated;
revoke all on roster_entries from anon, authenticated;
revoke all on matchups from anon, authenticated;
revoke all on transactions from anon, authenticated;
revoke all on sync_runs from anon, authenticated;

grant all on platform_accounts to service_role;
grant all on players to service_role;
grant all on player_ids to service_role;
grant all on leagues to service_role;
grant all on teams to service_role;
grant all on roster_entries to service_role;
grant all on matchups to service_role;
grant all on transactions to service_role;
grant all on sync_runs to service_role;

alter view my_week set (security_invoker = true);
revoke all on my_week from anon, authenticated;
grant select on my_week to service_role;

create index if not exists matchups_team_id_idx on matchups (team_id);
create index if not exists matchups_opponent_team_id_idx on matchups (opponent_team_id);
create index if not exists roster_entries_player_id_idx on roster_entries (player_id);
create index if not exists sync_runs_league_id_idx on sync_runs (league_id);
