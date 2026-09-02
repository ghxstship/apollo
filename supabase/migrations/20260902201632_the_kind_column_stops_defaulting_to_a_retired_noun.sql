/* episodes.kind defaulted to 'voyage' — a retired display noun — and the
   default was also load-bearing in the wrong direction.

   an_episode_keeps_its_taxonomy derives kind from the setting, but only when
   kind is null, blank, or one of the two values it writes itself. 'voyage' is
   none of those, so the DEFAULT silently opted every new episode OUT of its own
   derivation: an episode raised without an explicit kind kept 'voyage' forever,
   whether it happened on a boat or on a rooftop. The e2e suite found it the
   moment a test stopped passing kind by hand.

   The default becomes null, which is what a derived column should default to,
   and the trigger fills it. Existing rows still holding the default are moved
   to whichever value their setting implies — the answer the trigger would have
   given had it ever been asked. */
alter table public.episodes alter column kind drop default;

do $$
declare n int;
begin
  update public.episodes
     set kind = case when setting = 'sea' then 'sea_day' else 'port_day' end
   where kind = 'voyage';
  get diagnostics n = row_count;
  raise notice 'episodes moved off the voyage default: %', n;
end $$;

/* And let the trigger reclaim the word if a row ever carries it again. */
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
  /* 'voyage' joins the list this trigger is allowed to overwrite. It was the
     column default and therefore the one value that could never be corrected. */
  if new.kind is null or btrim(new.kind) = '' or new.kind in ('sea_day','port_day','voyage') then
    new.kind := case when new.setting = 'sea' then 'sea_day' else 'port_day' end;
  end if;
  if new.ends_at is not null and new.ends_at > new.starts_at
     and (new.sub_class is null or new.sub_class in ('passage','expedition','odyssey')) then
    hours := extract(epoch from (new.ends_at - new.starts_at)) / 3600.0;
    new.sub_class := case when hours < 4 then 'passage' when hours <= 8 then 'expedition' else 'odyssey' end;
  end if;
  return new;
end $function$;;
