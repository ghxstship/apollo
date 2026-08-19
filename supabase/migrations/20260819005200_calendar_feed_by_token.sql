-- A calendar app carries no cookies, so the token on the profile IS the
-- authorisation. A definer RPC keeps that lookup off the service-role key —
-- nothing else is reachable with it, and an unknown token returns no rows.
create or replace function public.calendar_feed(p_token uuid)
returns table (
  rsvp_id uuid, boarding_code text, guests int,
  slug text, title text, class public.event_class, blurb text,
  starts_at timestamptz, ends_at timestamptz, coordinates text, muster text
) language sql stable security definer set search_path = public as $$
  select r.id, r.boarding_code, r.guests,
         v.slug, v.title, v.class, v.blurb,
         v.starts_at, v.ends_at, v.coordinates, v.muster
  from public.profiles p
  join public.rsvps r on r.profile_id = p.id and r.status = 'aboard'
  join public.voyages v on v.id = r.voyage_id
  where p.calendar_token = p_token
  order by v.starts_at asc;
$$;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
