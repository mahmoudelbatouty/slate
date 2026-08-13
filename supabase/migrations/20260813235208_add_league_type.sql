alter table public.leagues
  add column league_type text not null default 'redraft';

update public.leagues
set league_type = case scoring_raw #>> '{settings,type}'
  when '1' then 'keeper'
  when '2' then 'dynasty'
  else 'redraft'
end
where platform = 'sleeper';

alter table public.leagues
  add constraint leagues_league_type_check
  check (league_type in ('redraft', 'keeper', 'dynasty'));
