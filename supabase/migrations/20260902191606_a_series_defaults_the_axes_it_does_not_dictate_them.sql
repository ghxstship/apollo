/* The 2026-27 Miami programme does not fit the taxonomy as written, and the
   programme is the fact.

   TWO THINGS BROKE when the real fifty-two weeks were mapped onto it.

   1. A series spans more than one experience class. Adventure runs at Tier 2,
      Tier 3 and Tier 4 in the same year — a mangrove paddle and a private
      racetrack night are the same strand and plainly not the same class. The
      trigger force-set experience_class from the series, so importing the
      programme would have flattened all nine Adventure episodes onto whichever
      class the series row happened to carry.

   2. A series spans both settings. Adventure is an airboat safari one month and
      a polo field the next; Fitness is a rooftop studio in March and a hydrofoil
      on Marine Stadium basin in August. category was NOT NULL and sea|port, so
      every strand had to pick one and lie about the rest.

   The correction is small and it is the right shape either way: a series
   DEFAULTS the axes, it does not dictate them. The trigger now fills only what
   the episode left null, so an unfiled episode still gets a class — which the
   plan ceiling in pass_guard depends on and which must not become optional —
   while a real programme can say what is actually true.

   Anchor stays the exception that proves it: it is a yacht charter and is
   always afloat, so its category stays 'sea' and every episode under it
   inherits that without being told twice. */

alter table public.series alter column category drop not null;
comment on column public.series.category is
  'Default setting for episodes in this series: sea, port, or null when the series runs both.';
comment on column public.series.experience_class is
  'Default class for episodes in this series. An episode may state its own; the trigger fills only nulls.';

create or replace function public.an_episode_keeps_its_taxonomy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare cat text; xclass text; hours numeric;
begin
  if new.series is not null then
    select category, experience_class into cat, xclass
    from public.series where slug = new.series;
    /* Fill, never overwrite. The episode is closer to the truth than the
       catalogue: one strand runs afloat and ashore, and at more than one
       class, across a single season. */
    if new.setting is null then
      if cat = 'port' then new.setting := 'shore';
      elsif cat = 'sea' then new.setting := 'sea';
      end if;
    end if;
    if new.experience_class is null and xclass is not null then
      new.experience_class := xclass;
    end if;
  end if;
  /* The floor stays absolute. An episode filed under nothing still leaves here
     with a class, because the plan ceiling reads it on every booking. */
  if new.experience_class is null then
    new.experience_class := case when new.setting = 'sea' then 'club' else 'open' end;
  end if;
  if new.kind is null or btrim(new.kind) = '' or new.kind in ('sea_day','port_day') then
    new.kind := case when new.setting = 'sea' then 'sea_day' else 'port_day' end;
  end if;
  if new.ends_at is not null and new.ends_at > new.starts_at
     and (new.sub_class is null or new.sub_class in ('voyage','expedition','odyssey')) then
    hours := extract(epoch from (new.ends_at - new.starts_at)) / 3600.0;
    new.sub_class := case when hours < 4 then 'voyage' when hours <= 8 then 'expedition' else 'odyssey' end;
  end if;
  return new;
end $function$;;
