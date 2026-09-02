-- The four taxonomy columns agree by construction: a format decides the class,
-- the class decides the default kind, and a sailing with both ends stated
-- takes its sub-class from its length (under 4 h a voyage, to 8 h an
-- expedition, past 8 h an odyssey) — the ladder brand.ts has always described.
create or replace function public.a_sailing_keeps_its_taxonomy()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare cat text; hours numeric;
begin
  if new.format is not null then
    select category into cat from public.activity_formats where slug = new.format;
    if cat = 'port' then new.class := 'shore';
    elsif cat = 'sea' then new.class := 'sea';
    end if;
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
end $$;
revoke execute on function public.a_sailing_keeps_its_taxonomy() from public, anon, authenticated;
create trigger a_sailing_keeps_its_taxonomy
  before insert or update of format, class, kind, starts_at, ends_at, sub_class on public.voyages
  for each row execute function public.a_sailing_keeps_its_taxonomy();

-- Add-ons were bought per head and stayed paid when the heads left: a guest
-- reduction now trims each line to the heads that remain and credits the rest.
create or replace function public.an_add_on_follows_the_heads()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare allowed integer; line record;
begin
  if tg_op <> 'UPDATE' or coalesce(new.guests, 0) >= coalesce(old.guests, 0) then return new; end if;
  allowed := 1 + coalesce(new.guests, 0);
  for line in select ra.addon_id, ra.qty, a.name, a.price_cents
              from public.rsvp_addons ra join public.addons a on a.id = ra.addon_id
              where ra.rsvp_id = new.id and ra.qty > allowed loop
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
    values (new.profile_id, line.price_cents * (line.qty - allowed), 'credit',
            line.name || ' — ' || (line.qty - allowed) || ' fewer aboard', new.voyage_id, new.id, new.profile_id);
    update public.rsvp_addons set qty = allowed where rsvp_id = new.id and addon_id = line.addon_id;
  end loop;
  return new;
end $$;
revoke execute on function public.an_add_on_follows_the_heads() from public, anon, authenticated;
create trigger an_add_on_follows_the_heads
  after update of guests on public.rsvps
  for each row execute function public.an_add_on_follows_the_heads();;
