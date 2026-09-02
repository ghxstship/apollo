/* The last retired noun in the schema. sub_class held voyage | expedition |
   odyssey — three duration bands whose LABELS are hour phrases and whose keys
   never render, which is exactly why this one survived every earlier pass.

   Full alignment does not have an exception for values a reader cannot see. A
   member who cannot book a long episode is told their plan stops short, and the
   refusal text capitalises the stored key to say which band it was — so voyage
   did in fact reach a screen, in the one place it matters.

   passage, not episode: an episode is the thing itself and cannot also be one
   third of its own duration ladder. Expedition and odyssey stay — neither is
   retired, and they carry the ladder's character. */
do $$
declare n int;
begin
  alter table public.episodes drop constraint if exists a_class_ceiling_knows_its_rungs;
  alter table public.episodes drop constraint if exists episodes_sub_class_check;
  alter table public.episodes drop constraint if exists voyages_sub_class_check;

  update public.episodes set sub_class = 'passage' where sub_class = 'voyage';
  get diagnostics n = row_count;
  raise notice 'sub_class voyage -> passage: % rows', n;

  alter table public.episodes add constraint episodes_sub_class_check
    check (sub_class is null or sub_class in ('passage','expedition','odyssey'));
end $$;

/* The trigger writes this column from the hours; it has to write the new word
   or the very next save puts voyage back. */
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
     and (new.sub_class is null or new.sub_class in ('passage','expedition','odyssey')) then
    hours := extract(epoch from (new.ends_at - new.starts_at)) / 3600.0;
    new.sub_class := case when hours < 4 then 'passage' when hours <= 8 then 'expedition' else 'odyssey' end;
  end if;
  return new;
end $function$;;
