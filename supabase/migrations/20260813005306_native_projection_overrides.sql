create table native_projections (
  id                  uuid primary key default gen_random_uuid(),
  installation_id     uuid not null references connector_installations(id) on delete cascade,
  platform            platform not null,
  external_league_id  text not null,
  external_team_id    text not null,
  week                int not null check (week between 1 and 25),
  projected_points    numeric(10,2) not null,
  captured_at         timestamptz not null,
  unique (platform, external_league_id, external_team_id, week)
);

create index native_projections_lookup
  on native_projections (platform, external_league_id, week);

alter table native_projections enable row level security;
revoke all on native_projections from anon, authenticated;
grant all on native_projections to service_role;
