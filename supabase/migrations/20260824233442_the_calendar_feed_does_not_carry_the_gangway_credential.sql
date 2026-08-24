-- The ICS route states the threat exactly: "an ICS subscription syncs to Google
-- and Apple servers and onto every device on the account", and so it never
-- prints the boarding code. But the RPC underneath it RETURNS the code, and the
-- RPC is granted to anon and takes the same token the calendar URL carries.
-- Anyone holding the feed URL — precisely the population that comment worries
-- about — gets the gangway credential for every sailing that member holds, with
-- one extra request. The code also embeds the member number.
--
-- The route never used the column. A definer function is a hole exactly the
-- size of what it returns, so it returns one column less.
drop function if exists public.calendar_feed(uuid);

create or replace function public.calendar_feed(p_token uuid)
returns table(
  rsvp_id uuid, guests integer, slug text, title text, class event_class,
  blurb text, starts_at timestamptz, ends_at timestamptz,
  coordinates text, muster text, status text, time_zone text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select r.id, r.guests,
         v.slug, v.title, v.class, v.blurb,
         v.starts_at, v.ends_at, v.coordinates, v.muster,
         v.status::text, v.time_zone
  from public.profiles p
  join public.rsvps r on r.profile_id = p.id and r.status = 'aboard'
  join public.voyages v on v.id = r.voyage_id
  where p.calendar_token = p_token
  order by v.starts_at asc;
$function$;

revoke execute on function public.calendar_feed(uuid) from public;
grant execute on function public.calendar_feed(uuid) to anon, authenticated;
;
