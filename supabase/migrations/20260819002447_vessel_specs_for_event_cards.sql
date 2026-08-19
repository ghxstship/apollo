-- Event-card enrichment (docs/EVENT-CARD-ENRICHMENT.md step 1): the fleet's
-- specs, so an event page can answer "what am I sailing on" without leaving.
alter table public.vessels
  add column length_ft int,
  add column year int,
  add column cabins int;

update public.vessels set length_ft = v.len, year = v.yr, cabins = v.cab
from (values
  ('Calliope', 51, 2019, 5),
  ('Halcyon', 47, 2021, 4),
  ('Meridian', 52, 2020, 5),
  ('Nightjar', 44, 2022, 4)
) as v(name, len, yr, cab)
where vessels.name = v.name;
