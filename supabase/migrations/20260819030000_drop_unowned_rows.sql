-- Remove the pre-auth, ownerless rows and make them impossible to recreate.
--
-- Before Supabase Auth landed, a sync could run without an owner: SLEEPER_USERNAME
-- added an unowned Sleeper connection, and the nightly cron calls runSync with no
-- owner, so every night wrote a third copy of every league beside the real
-- accounts'. Nothing could read those rows — every user-facing query is scoped by
-- owner_id — but they were a third of the largest table:
--
--     leagues          12   (all duplicates of an owned league; none unique)
--     teams           140
--     matchups      1,050
--     roster_entries 21,873   of 67,108 total
--     transactions     294
--
-- The code path that produced them is gone (src/sync/run.ts). This clears what it
-- already wrote and adds the constraint that would have caught it. Deletes cascade
-- from leagues through teams, matchups, roster_entries, and transactions.
--
-- Safety: this only ever touches rows with owner_id is null. Every real row —
-- including two separate accounts that share leagues, whose rows legitimately
-- duplicate each other on (platform, external_id) — is untouched.

delete from public.leagues where owner_id is null;

-- Ownerless sync bookkeeping and pairings from the same era.
delete from public.sync_runs where owner_id is null;
delete from public.connector_installations where owner_id is null;
delete from public.connector_pairing_challenges where owner_id is null;

-- A league with no owner is unreadable by definition, so let the database say so
-- rather than discovering another 21,000 orphans later.
alter table public.leagues alter column owner_id set not null;
