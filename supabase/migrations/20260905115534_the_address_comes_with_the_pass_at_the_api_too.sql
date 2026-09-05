-- Every page says the address comes with the pass, and the public .ics says
-- the city. The API said otherwise: episodes.muster and episodes.coordinates,
-- and venues.address and venues.notes, were anon-readable through PostgREST.
-- The grant is the place to close it for the door that is not signed in;
-- signed-in members keep the columns (their pages gate on the pass), because
-- a column revoke from authenticated turns every select("*") on the Bridge
-- into a 42501.
revoke select on public.episodes from anon;
grant select (
  id, slug, title, setting, kind, city_id, starts_at, ends_at, distance_nm, passes_total, price_cents, status,
  blurb, description, media, min_tier, created_at, deposit_required, conditions, knots_multiplier, sub_class,
  itinerary, held_passes, time_zone, series, deck_state, deposit_cents, sale_opens_at, presale_hours, season_id,
  venue_id, edition_id, hull_ceiling_heads, hull_certificate, experience_class, by_request, standby_passes, age_line
) on public.episodes to anon;

revoke select on public.venues from anon;
grant select (id, slug, name, city_id, kind, active, created_at, access_note, fee_cents) on public.venues to anon;;
