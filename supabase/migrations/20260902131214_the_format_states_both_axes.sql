/* A format now states both facts, so the sailing takes both from it.

   The taxonomy trigger already derived class (where) and kind and the duration
   ladder from the format. It now derives experience_class (what kind) the same
   way, which means an operator files a sailing by choosing its format and the
   rest follows — the one place the two axes could drift apart is closed.

   An operator may still set experience_class by hand on a sailing with no
   format; the trigger only overrides when a format names one. */
create or replace function public.a_sailing_keeps_its_taxonomy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare cat text; xclass text; hours numeric;
begin
  if new.format is not null then
    select category, experience_class into cat, xclass
    from public.activity_formats where slug = new.format;
    if cat = 'port' then new.class := 'shore';
    elsif cat = 'sea' then new.class := 'sea';
    end if;
    if xclass is not null then new.experience_class := xclass; end if;
  end if;
  if new.experience_class is null then
    new.experience_class := case when new.class = 'sea' then 'club' else 'open' end;
  end if;
  if new.kind is null or btrim(new.kind) = '' or new.kind in ('sea_day','port_day') then
    new.kind := case when new.class = 'sea' then 'sea_day' else 'port_day' end;
  end if;
  if new.ends_at is not null and new.ends_at > new.starts_at
     and (new.sub_class is null or new.sub_class in ('voyage','expedition','odyssey')) then
    hours := extract(epoch from (new.ends_at - new.starts_at)) / 3600.0;
    new.sub_class := case when hours < 4 then 'voyage' when hours <= 8 then 'expedition' else 'odyssey' end;
  end if;
  return new;
end $function$;;
