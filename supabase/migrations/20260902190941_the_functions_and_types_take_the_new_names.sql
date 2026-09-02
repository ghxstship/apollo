/* Full alignment reaches the callable surface. Twenty function names and three
   type names still carried voyage, harbor, rsvp, sailing or format.

   Renames here are OID-level and therefore safe in a way the body rewrite was
   not: triggers bind to a function by OID, columns bind to a type by OID, and
   both follow a rename without being touched. What does NOT follow is a call
   BY NAME from inside another body, or from the application — so the two RPCs
   the app calls by name (shared_voyages and voyage_manifest) move here and the
   client is updated in the same commit.

   sailing survives nowhere as a noun for the thing. It was the last synonym
   still standing after charter, voyage and event were retired. */

-- triggers and guards on the event
alter function public.a_sailing_honours_its_format() rename to an_episode_honours_its_series;
alter function public.a_sailing_keeps_its_taxonomy() rename to an_episode_keeps_its_taxonomy;
alter function public.a_sailing_inside_the_window_is_cancelled_not_struck() rename to an_episode_inside_the_window_is_cancelled_not_struck;
alter function public.close_out_a_cancelled_sailing() rename to close_out_a_cancelled_episode;
alter function public.close_threads_when_the_sailing_ends() rename to close_threads_when_the_episode_ends;
alter function public.return_knots_before_the_sailing_goes() rename to return_knots_before_the_episode_goes;
alter function public.guard_pass_stays_on_its_sailing() rename to guard_pass_stays_on_its_episode;
alter function public.handle_voyage_status() rename to handle_episode_status;
alter function public.voyage_status_is_a_course() rename to episode_status_is_a_course;
alter function public.automations_on_voyage() rename to automations_on_episode;

-- what a member holds is a pass
alter function public.rsvp_guard() rename to pass_guard;
alter function public.rsvp_not_in_the_past() rename to pass_not_in_the_past;
alter function public.handle_rsvp_aboard() rename to handle_pass_aboard;
alter function public.handle_rsvp_release() rename to handle_pass_release;
alter function public.automations_on_rsvp() rename to automations_on_pass;

-- the clock belongs to a city
alter function public.harbor_clock_moves_its_voyages() rename to city_clock_moves_its_episodes;
alter function public.profile_takes_harbor_clock() rename to profile_takes_city_clock;
alter function public.voyage_takes_harbor_clock() rename to episode_takes_city_clock;

/* The two the application calls by name. A rename is invisible to PostgREST
   callers until the client is changed, so these two and only these two force a
   matching app edit. */
alter function public.shared_voyages(uuid) rename to shared_episodes;
alter function public.voyage_manifest(uuid) rename to episode_manifest;

/* Types. event_class held sea|shore|sky and IS the setting axis; naming it
   after the retired noun event while the column it types is called setting was
   the last place the two axes read as one. The enum LABELS are untouched:
   sea and shore are the values the guards compare against, and port is a
   literal in that comparison rather than a column. */
alter type public.event_class rename to setting;
alter type public.rsvp_status rename to pass_status;
alter type public.voyage_status rename to episode_status;

/* A cancelled episode is closed out by a trigger whose name says so; the enum
   and the function now agree. Nothing else in this migration changes behaviour
   — every statement is a name. */;
