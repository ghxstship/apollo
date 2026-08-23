-- A member's subscribed season published every event as CONFIRMED, so a
-- cancelled sailing stayed on their calendar as going ahead and a weather hold
-- never greyed.
drop function if exists public.calendar_feed(uuid);

create or replace function public.calendar_feed(p_token uuid)
returns table(
  rsvp_id uuid, boarding_code text, guests integer,
  slug text, title text, class event_class, blurb text,
  starts_at timestamptz, ends_at timestamptz, coordinates text, muster text,
  status text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select r.id, r.boarding_code, r.guests,
         v.slug, v.title, v.class, v.blurb,
         v.starts_at, v.ends_at, v.coordinates, v.muster,
         v.status::text
  from public.profiles p
  join public.rsvps r on r.profile_id = p.id and r.status = 'aboard'
  join public.voyages v on v.id = r.voyage_id
  where p.calendar_token = p_token
  order by v.starts_at asc;
$function$;

revoke execute on function public.calendar_feed(uuid) from public;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
