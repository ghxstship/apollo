/* FULL alignment, front and back — owner decision 2026-09-02, overriding the
   earlier call that database names are plumbing and exempt.

   The reason that call was made, and why it is not a reason to refuse: ALTER
   TABLE ... RENAME does NOT rewrite function bodies. Foreign keys, indexes,
   policies and views all hold parse trees and follow a rename automatically; a
   plpgsql body is stored as text and is only re-parsed when it next runs, so a
   stale reference fails at runtime rather than at migration time. There are 206
   functions here and about ninety name something being retired. They are
   repaired in the migration that follows this one, and migrations:replay plus
   the 1678-check e2e suite are what prove it.

   THE ONE COLLISION. There was already an episodes table: the published cut of
   a voyage, carrying a number, a dek, an aired_at and a voyage_id. It is not the
   event, it is the recording of one, so it takes episode_cuts and gets out of
   the way before voyages moves in. Both facts survive and neither is renamed
   into the other.

   Order is load-bearing throughout: the occupant of a name always moves before
   the newcomer arrives. */

-- the collision, resolved first
alter table public.episodes rename to episode_cuts;

-- the event itself
alter table public.voyages rename to episodes;

-- everything hanging off the event
alter table public.voyage_capacity rename to episode_capacity;
alter table public.voyage_daybeds rename to episode_daybeds;
alter table public.voyage_legs rename to episode_legs;
alter table public.voyage_media rename to episode_media;
alter table public.voyage_radar rename to episode_radar;
alter table public.voyage_segment_capacity rename to episode_segment_capacity;
alter table public.voyage_segment_caps rename to episode_segment_caps;
alter table public.voyage_sponsors rename to episode_sponsors;
alter table public.voyage_stops rename to episode_stops;
alter table public.voyage_vessels rename to episode_vessels;

/* Series and editions. activity_formats was the catalogue of named strands and
   is simply Series now. voyage_series held a cadence and nothing else and has
   become the edition — a series running in one city. */
alter table public.activity_formats rename to series;
alter table public.voyage_series rename to editions;

-- the market
alter table public.harbors rename to cities;

/* The currency is Knots and has been since the rebrand; Fathoms is a banned
   term that survived only in these two names. */
alter table public.fathoms_ledger rename to knots_ledger;
alter table public.fathoms_balance rename to knots_balance;

/* The editorial is the Log. The Dispatch is banned prose and was still the
   table. */
alter table public.dispatch_posts rename to log_posts;

/* The feed is the Open Deck. The Wardroom is banned prose. */
alter table public.wardroom_posts rename to open_deck_posts;
alter table public.wardroom_comments rename to open_deck_comments;
alter table public.wardroom_flags rename to open_deck_flags;
alter table public.wardroom_hails rename to open_deck_hails;

/* A table is the blind dinner for six and nothing else, which is the one thing
   the word ever meant here — so it can hold the bare noun without ambiguity. */
alter table public.dating_tables rename to tables;

/* What a member holds is a pass. RSVP is software vocabulary that never once
   appeared on screen. pass_transfers already existed and is untouched. */
alter table public.rsvps rename to passes;
alter table public.rsvp_addons rename to pass_addons;
alter table public.rsvp_guests rename to pass_guests;;
