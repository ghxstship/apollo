import type { EpisodeRow } from "@/lib/supabase/types";

/* The columns of `episodes` the API hands to the door that is not signed in.
   Since 2026-09-05 (the_address_comes_with_the_pass_at_the_api_too) anon
   holds a column-level grant that leaves out `coordinates` and `muster` — the
   address comes with the pass. A public page that asks select("*") asks for
   those two as well, PostgREST refuses the whole read with 42501, and the page
   reads the refusal as no such episode: every /episodes/<slug> answered 404
   to the shore. Public reads name their columns from here; the place is a
   second question, asked only once the pass is proven. Keep this list equal
   to the grant. */
export const EPISODE_PUBLIC_COLUMNS =
  "id, slug, title, setting, kind, city_id, starts_at, ends_at, distance_nm, passes_total, price_cents, status, " +
  "blurb, description, media, min_tier, created_at, deposit_required, conditions, knots_multiplier, sub_class, " +
  "itinerary, held_passes, time_zone, series, deck_state, deposit_cents, sale_opens_at, presale_hours, season_id, " +
  "venue_id, edition_id, hull_ceiling_heads, hull_certificate, experience_class, by_request, standby_passes, age_line";

export type PublicEpisode = Omit<EpisodeRow, "coordinates" | "muster">;

/* The two columns the grant withholds, as a row shaped for the reveal. */
export type EpisodePlace = Pick<EpisodeRow, "coordinates" | "muster">;
