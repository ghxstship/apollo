-- The route audit hand-copied the ban list and matched case-sensitively.
-- Reading brand.ts and folding case, two retired names surface in copy the club
-- itself shipped and has been serving on every load:
--
--   "Home port. The Open Deck hears about it." — the last stop in the itinerary
--     of five charters. "Home Port" is the retired name for the member's Home
--     surface; where a boat ties up is its home harbour.
--
--   "writing the Dispatch piece everyone forwards" — in a published episode.
--     The Dispatch was retired; the magazine is Episodes.
update public.voyages
   set itinerary = replace(itinerary::text, 'Home port.', 'Home harbor.')::jsonb
 where itinerary::text ilike '%home port.%';

update public.dispatch_posts
   set body = replace(body, 'the Dispatch piece', 'the Episodes piece')
 where body ilike '%the dispatch piece%';;
