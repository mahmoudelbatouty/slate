alter table public.roster_entries
  add column if not exists lineup_order smallint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'roster_entries_lineup_order_nonnegative'
      and conrelid = 'public.roster_entries'::regclass
  ) then
    alter table public.roster_entries
      add constraint roster_entries_lineup_order_nonnegative
      check (lineup_order >= 0);
  end if;
end
$$;
