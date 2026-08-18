-- Replace the prototype-wide password gate with user-owned data. Existing
-- rows intentionally remain unowned until the sole prototype user signs in;
-- the app then performs a one-time, server-only ownership claim.

alter table public.platform_accounts add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.leagues add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.sync_runs add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.connector_installations add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.connector_pairing_challenges add column owner_id uuid references auth.users(id) on delete cascade;
alter table public.native_projections add column owner_id uuid references auth.users(id) on delete cascade;

alter table public.platform_accounts drop constraint platform_accounts_platform_key;
alter table public.platform_accounts
  add constraint platform_accounts_owner_platform_key unique nulls not distinct (owner_id, platform);

alter table public.leagues drop constraint leagues_platform_external_id_season_key;
alter table public.leagues
  add constraint leagues_owner_platform_external_season_key
  unique nulls not distinct (owner_id, platform, external_id, season);

alter table public.native_projections
  drop constraint native_projections_platform_external_league_id_external_tea_key;
alter table public.native_projections
  add constraint native_projections_owner_platform_league_team_week_key
  unique nulls not distinct (owner_id, platform, external_league_id, external_team_id, week);

create index platform_accounts_owner_id_idx on public.platform_accounts (owner_id);
create index leagues_owner_id_idx on public.leagues (owner_id);
create index sync_runs_owner_id_idx on public.sync_runs (owner_id);
create index connector_installations_owner_platform_idx
  on public.connector_installations (owner_id, platform, created_at desc)
  where revoked_at is null;
create index connector_pairing_challenges_owner_id_idx
  on public.connector_pairing_challenges (owner_id);
create index native_projections_owner_id_idx on public.native_projections (owner_id);

-- Authenticated clients are read-only. Trusted sync and connector writes keep
-- using the service role, but every user-facing read is also guarded by RLS.
grant select on public.platform_accounts, public.players, public.player_ids,
  public.leagues, public.teams, public.roster_entries, public.matchups,
  public.transactions, public.sync_runs, public.nfl_games,
  public.connector_installations, public.connector_captures,
  public.connector_pairing_challenges, public.native_projections,
  public.lineup_commands, public.lineup_command_events
to authenticated;

create policy platform_accounts_owner_select on public.platform_accounts
  for select to authenticated using (owner_id = (select auth.uid()));
create policy leagues_owner_select on public.leagues
  for select to authenticated using (owner_id = (select auth.uid()));
create policy sync_runs_owner_select on public.sync_runs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy connector_installations_owner_select on public.connector_installations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy connector_pairing_challenges_owner_select on public.connector_pairing_challenges
  for select to authenticated using (owner_id = (select auth.uid()));
create policy native_projections_owner_select on public.native_projections
  for select to authenticated using (owner_id = (select auth.uid()));

create policy teams_owner_select on public.teams
  for select to authenticated using (
    exists (
      select 1 from public.leagues
      where leagues.id = teams.league_id
        and leagues.owner_id = (select auth.uid())
    )
  );
create policy roster_entries_owner_select on public.roster_entries
  for select to authenticated using (
    exists (
      select 1 from public.teams
      join public.leagues on leagues.id = teams.league_id
      where teams.id = roster_entries.team_id
        and leagues.owner_id = (select auth.uid())
    )
  );
create policy matchups_owner_select on public.matchups
  for select to authenticated using (
    exists (
      select 1 from public.leagues
      where leagues.id = matchups.league_id
        and leagues.owner_id = (select auth.uid())
    )
  );
create policy transactions_owner_select on public.transactions
  for select to authenticated using (
    exists (
      select 1 from public.leagues
      where leagues.id = transactions.league_id
        and leagues.owner_id = (select auth.uid())
    )
  );
create policy connector_captures_owner_select on public.connector_captures
  for select to authenticated using (
    exists (
      select 1 from public.connector_installations
      where connector_installations.id = connector_captures.installation_id
        and connector_installations.owner_id = (select auth.uid())
    )
  );
create policy lineup_commands_owner_select on public.lineup_commands
  for select to authenticated using (
    exists (
      select 1 from public.leagues
      where leagues.id = lineup_commands.league_id
        and leagues.owner_id = (select auth.uid())
    )
  );
create policy lineup_command_events_owner_select on public.lineup_command_events
  for select to authenticated using (
    exists (
      select 1 from public.lineup_commands
      join public.leagues on leagues.id = lineup_commands.league_id
      where lineup_commands.id = lineup_command_events.command_id
        and leagues.owner_id = (select auth.uid())
    )
  );

create policy players_authenticated_select on public.players
  for select to authenticated using (true);
create policy player_ids_authenticated_select on public.player_ids
  for select to authenticated using (true);
create policy nfl_games_authenticated_select on public.nfl_games
  for select to authenticated using (true);

grant select on public.my_week, public.starter_game_state to authenticated;

create or replace function public.claim_connector_pairing(
  p_pairing_id uuid,
  p_challenge_hash text,
  p_token_hash text,
  p_platform platform,
  p_dashboard_origin text
)
returns table (
  installation_id uuid,
  platform platform,
  dashboard_origin text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_platform platform;
  v_dashboard_origin text;
  v_owner_id uuid;
  v_installation_id uuid;
begin
  update connector_pairing_challenges as challenge
  set consumed_at = now()
  where challenge.id = p_pairing_id
    and challenge.challenge_hash = p_challenge_hash
    and challenge.platform = p_platform
    and challenge.dashboard_origin = p_dashboard_origin
    and challenge.owner_id is not null
    and challenge.consumed_at is null
    and challenge.expires_at > now()
  returning challenge.platform, challenge.dashboard_origin, challenge.owner_id
  into v_platform, v_dashboard_origin, v_owner_id;

  if not found then
    return;
  end if;

  insert into connector_installations (token_hash, platform, owner_id)
  values (p_token_hash, v_platform, v_owner_id)
  returning id into v_installation_id;

  update connector_pairing_challenges
  set installation_id = v_installation_id
  where id = p_pairing_id;

  return query
  select v_installation_id, v_platform, v_dashboard_origin;
end;
$$;

revoke all on function public.claim_connector_pairing(uuid, text, text, platform, text)
  from public, anon, authenticated;
grant execute on function public.claim_connector_pairing(uuid, text, text, platform, text)
  to service_role;
