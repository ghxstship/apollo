/* The columns follow the tables. Same pass, same reasoning — see the migration
   before this one for why function bodies do not follow on their own and where
   they are repaired.

   Views need their own ALTER: renaming a base column rewrites the view's
   definition automatically, but the view's OUTPUT column keeps the old name
   until it is renamed too, and the output name is what PostgREST serves. */

-- the event's own columns
alter table public.episodes rename column harbor_id to city_id;
alter table public.episodes rename column berths_total to passes_total;
alter table public.episodes rename column fathoms_multiplier to knots_multiplier;
/* format was the strand and series_id was the run of it; now that the strand IS
   the series, series_id has to vacate the name before format can take it. */
alter table public.episodes rename column series_id to edition_id;
alter table public.episodes rename column format to series;
/* class held sea|shore, which is the SETTING axis. Sitting next to
   experience_class under the bare name class, it read as the same axis twice. */
alter table public.episodes rename column class to setting;

-- the edition names the series it is an edition of, and the city it runs in
alter table public.editions rename column format to series;
alter table public.editions rename column harbor_id to city_id;
alter table public.editions rename column template_voyage_id to template_episode_id;

-- everything that pointed at a voyage points at an episode
alter table public.account_ledger rename column voyage_id to episode_id;
alter table public.charter_options rename column voyage_id to episode_id;
alter table public.contests rename column voyage_id to episode_id;
alter table public.crew_requests rename column voyage_id to episode_id;
alter table public.tables rename column voyage_id to episode_id;
alter table public.episode_cuts rename column voyage_id to episode_id;
alter table public.knots_ledger rename column voyage_id to episode_id;
alter table public.galley_orders rename column voyage_id to episode_id;
alter table public.member_event_proposals rename column voyage_id to episode_id;
alter table public.notifications rename column voyage_id to episode_id;
alter table public.pod_sessions rename column voyage_id to episode_id;
alter table public.promo_codes rename column voyage_id to episode_id;
alter table public.radar_picks rename column voyage_id to episode_id;
alter table public.passes rename column voyage_id to episode_id;
alter table public.run_of_show rename column voyage_id to episode_id;
alter table public.shared_anchors rename column voyage_id to episode_id;
alter table public.threads rename column voyage_id to episode_id;
alter table public.episode_daybeds rename column voyage_id to episode_id;
alter table public.episode_legs rename column voyage_id to episode_id;
alter table public.episode_media rename column voyage_id to episode_id;
alter table public.episode_radar rename column voyage_id to episode_id;
alter table public.episode_segment_caps rename column voyage_id to episode_id;
alter table public.episode_sponsors rename column voyage_id to episode_id;
alter table public.episode_stops rename column voyage_id to episode_id;
alter table public.episode_vessels rename column voyage_id to episode_id;
alter table public.waitlist_entries rename column voyage_id to episode_id;
alter table public.open_deck_posts rename column voyage_id to episode_id;

-- the market, everywhere a member or a hull belongs to one
alter table public.profiles rename column home_harbor to home_city;
alter table public.vessels rename column home_harbor to home_city;
alter table public.venues rename column harbor_id to city_id;
/* A leg calls at a place; port is the setting word, not the place word. */
alter table public.episode_legs rename column port to place;
alter table public.crew_roles rename column port to city;
alter table public.charter_requests rename column format to series;
alter table public.member_event_proposals rename column format to series;
/* A cabin holds people, and berth is a banned term. */
alter table public.cabins rename column berths to sleeps;

/* A season belongs to a CITY, not to one series. This corrects the column added
   earlier today: the 52-week Miami programme runs five different series inside
   one season, so keying a season to a single edition cannot express it. The
   original reason for moving seasons off the club still holds — Miami launched
   in 2026 and Chicago launches in 2027 — and the city is the right key for it. */
alter table public.seasons rename column series_id to city_id;
alter table public.seasons drop constraint if exists seasons_series_id_fkey;
alter table public.seasons
  add constraint seasons_city_id_fkey foreign key (city_id)
  references public.cities(id) on delete cascade;
comment on column public.seasons.city_id is
  'The city whose year this season is. Null means a club-wide season.';

-- views: the output names PostgREST serves
alter view public.episode_capacity rename column voyage_id to episode_id;
alter view public.episode_capacity rename column berths_total to passes_total;
alter view public.episode_capacity rename column berths_left to passes_left;
alter view public.episode_segment_capacity rename column voyage_id to episode_id;
alter view public.waitlist_position rename column voyage_id to episode_id;
alter view public.member_directory rename column home_harbor to home_city;
alter table public.member_roll rename column home_harbor to home_city;;
