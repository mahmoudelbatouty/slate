alter table leagues
  add column format text not null default 'head_to_head';

update leagues
set format = 'chopped'
where platform = 'sleeper'
  and scoring_raw #>> '{settings,type}' = '3';

alter table leagues
  add constraint leagues_format_check
  check (format in ('head_to_head', 'chopped'));
