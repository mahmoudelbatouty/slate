-- Browser connector installations never store a fantasy-platform password,
-- cookie, or session token. The extension receives a random ingest-only token;
-- only its SHA-256 hash is retained here.
create table connector_installations (
  id            uuid primary key default gen_random_uuid(),
  token_hash    text not null unique check (length(token_hash) = 64),
  label         text not null default 'Browser connector',
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);

-- An audit/cache of approved, sanitized provider payloads. Raw HTTP headers,
-- cookies, request bodies, and credentials are never accepted by the API.
create table connector_captures (
  id                  uuid primary key default gen_random_uuid(),
  installation_id     uuid not null references connector_installations(id) on delete cascade,
  platform            platform not null,
  kind                text not null,
  external_league_id  text not null,
  week                int not null check (week between 1 and 25),
  payload             jsonb not null,
  captured_at         timestamptz not null,
  received_at         timestamptz not null default now(),
  unique (installation_id, platform, kind, external_league_id, week)
);

create index connector_captures_latest
  on connector_captures (platform, captured_at desc);

-- These tables are server-only. Even if public is exposed through the Data
-- API, browser clients receive no policies and therefore no rows.
alter table connector_installations enable row level security;
alter table connector_captures enable row level security;

revoke all on connector_installations from anon, authenticated;
revoke all on connector_captures from anon, authenticated;
grant all on connector_installations to service_role;
grant all on connector_captures to service_role;
