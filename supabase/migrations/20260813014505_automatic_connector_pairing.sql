alter table connector_installations
  add column platform platform not null default 'sleeper';

create table connector_pairing_challenges (
  id                uuid primary key default gen_random_uuid(),
  platform          platform not null,
  dashboard_origin  text not null check (dashboard_origin ~ '^https?://'),
  challenge_hash    text not null unique check (length(challenge_hash) = 64),
  session_hash      text not null check (length(session_hash) = 64),
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  consumed_at       timestamptz,
  installation_id   uuid references connector_installations(id) on delete set null,
  check (expires_at <= created_at + interval '5 minutes')
);

create index connector_pairing_challenges_expiry_idx
  on connector_pairing_challenges (expires_at)
  where consumed_at is null;

alter table connector_pairing_challenges enable row level security;
revoke all on connector_pairing_challenges from anon, authenticated;
grant all on connector_pairing_challenges to service_role;

create or replace function claim_connector_pairing(
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
  v_installation_id uuid;
begin
  update connector_pairing_challenges as challenge
  set consumed_at = now()
  where challenge.id = p_pairing_id
    and challenge.challenge_hash = p_challenge_hash
    and challenge.platform = p_platform
    and challenge.dashboard_origin = p_dashboard_origin
    and challenge.consumed_at is null
    and challenge.expires_at > now()
  returning challenge.platform, challenge.dashboard_origin
  into v_platform, v_dashboard_origin;

  if not found then
    return;
  end if;

  insert into connector_installations (token_hash, platform)
  values (p_token_hash, v_platform)
  returning id into v_installation_id;

  update connector_pairing_challenges
  set installation_id = v_installation_id
  where id = p_pairing_id;

  return query
  select v_installation_id, v_platform, v_dashboard_origin;
end;
$$;

revoke all on function claim_connector_pairing(uuid, text, text, platform, text)
  from public, anon, authenticated;
grant execute on function claim_connector_pairing(uuid, text, text, platform, text)
  to service_role;
