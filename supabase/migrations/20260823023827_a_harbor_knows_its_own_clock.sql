-- Departure dates and times were formatted with Date#getHours, i.e. in the
-- timezone of whatever machine rendered the page. On an Eastern server the
-- Miami sailings happened to look right and the Los Angeles ones were three
-- hours out and on the wrong calendar day. A sailing happens on its harbor's
-- clock, so the harbor carries one.
alter table public.harbors
  add column if not exists time_zone text not null default 'America/New_York';

update public.harbors set time_zone = 'America/New_York'    where slug = 'new-york';
update public.harbors set time_zone = 'America/New_York'    where slug = 'miami';
update public.harbors set time_zone = 'America/Los_Angeles' where slug = 'los-angeles';
update public.harbors set time_zone = 'America/Chicago'     where slug = 'chicago';

comment on column public.harbors.time_zone is
  'IANA zone the harbor keeps. Departure times are read on this clock, not the server''s.';
