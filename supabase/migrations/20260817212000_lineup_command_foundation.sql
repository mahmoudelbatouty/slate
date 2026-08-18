-- Provider-neutral foundation for confirmed lineup moves. These rows contain
-- normalized fantasy data only; provider credentials, cookies, request headers,
-- and raw provider responses must never be written here.
create table public.lineup_commands (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null default 'move_player'
                        check (kind = 'move_player'),
  platform              platform not null,
  league_id             uuid not null references public.leagues(id) on delete cascade,
  team_id               uuid not null references public.teams(id) on delete cascade,
  week                   smallint not null check (week between 1 and 25),
  external_player_id    text not null check (length(external_player_id) between 1 and 128),
  from_slot             text not null check (length(from_slot) between 1 and 32),
  to_slot               text not null check (length(to_slot) between 1 and 32),
  expected_lineup_hash  text not null
                        check (expected_lineup_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key       text not null unique
                        check (idempotency_key ~ '^[0-9a-f]{64}$'),
  preview               jsonb not null check (jsonb_typeof(preview) = 'object'),
  status                text not null default 'pending'
                        check (status in (
                          'pending', 'submitted', 'verified', 'rejected',
                          'expired', 'unknown'
                        )),
  result                jsonb check (result is null or jsonb_typeof(result) = 'object'),
  failure_code          text,
  submitted_at          timestamptz,
  verified_at           timestamptz,
  expires_at            timestamptz not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (from_slot <> to_slot),
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes'),
  check (verified_at is null or status = 'verified')
);

create index lineup_commands_league_id_idx
  on public.lineup_commands (league_id);

create index lineup_commands_team_id_idx
  on public.lineup_commands (team_id);

create index lineup_commands_active_idx
  on public.lineup_commands (team_id, week, created_at desc)
  where status in ('pending', 'submitted');

create table public.lineup_command_events (
  id          uuid primary key default gen_random_uuid(),
  command_id  uuid not null references public.lineup_commands(id) on delete cascade,
  status      text not null check (status in (
                'pending', 'submitted', 'verified', 'rejected',
                'expired', 'unknown'
              )),
  detail      jsonb not null default '{}'::jsonb
              check (jsonb_typeof(detail) = 'object'),
  created_at  timestamptz not null default now()
);

create index lineup_command_events_command_id_created_at_idx
  on public.lineup_command_events (command_id, created_at);

-- Always retain a status history, even if a future caller forgets to write an
-- explicit audit event. Provider-specific sanitized details can be added as a
-- separate event by the submission/verification service.
create function public.record_lineup_command_status_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.lineup_command_events (command_id, status)
    values (new.id, new.status);
  end if;
  return new;
end;
$$;

create trigger lineup_commands_status_audit
after insert or update of status on public.lineup_commands
for each row execute function public.record_lineup_command_status_event();

-- Both tables and the trigger function are server-only. There are deliberately
-- no anon/authenticated policies.
alter table public.lineup_commands enable row level security;
alter table public.lineup_command_events enable row level security;

revoke all on public.lineup_commands from anon, authenticated;
revoke all on public.lineup_command_events from anon, authenticated;
grant all on public.lineup_commands to service_role;
grant all on public.lineup_command_events to service_role;

revoke all on function public.record_lineup_command_status_event()
  from public, anon, authenticated;
grant execute on function public.record_lineup_command_status_event()
  to service_role;
