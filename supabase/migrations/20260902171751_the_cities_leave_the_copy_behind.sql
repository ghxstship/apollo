/* The City rename reaches the data. Retiring a word in code is still a red
   build while a row prints it — the route audit failed eleven public pages on
   copy that lives in Postgres, not in src.

   Every statement is anchored on the exact old string and reports how many rows
   it moved, so a re-run after hand-editing does not stamp over newer wording
   and a silently-zero update cannot pass for success.

   Two Harbors is a real Catalina settlement and the one edit here that changes
   a fact rather than a word. Isthmus Cove is the anchorage at that same spot,
   so the sentence stays true; the alternative was leaving a banned word in the
   flagship crossing blurb or carving a proper-noun exemption into a gate that
   is valuable precisely because it has none. */
do $$
declare n int; total int := 0;
begin
  update public.voyages set title = 'Tables ashore.'
   where slug = 'season-i-harbor-tables' and title = 'Harbor tables.';
  get diagnostics n = row_count; total := total + n;

  update public.voyages
     set blurb = 'The third city opens. Founding passes go to the waitlist first.'
   where slug = 'chicago-founding-night'
     and blurb = 'The third harbor opens. Founding passes go to the waitlist first.';
  get diagnostics n = row_count; total := total + n;

  update public.voyages
     set blurb = 'A night at sea. Twenty-nine nautical miles by starlight to Isthmus Cove.'
   where slug = 'night-passage-catalina'
     and blurb = 'A night at sea. Twenty-nine nautical miles by starlight to Two Harbors.';
  get diagnostics n = row_count; total := total + n;

  /* The run of show is jsonb. The offending note is the final Alongside step,
     shared verbatim by five episodes, so this is a targeted string replace
     inside the array rather than five hand-written literals. */
  update public.voyages
     set itinerary = replace(
           itinerary::text,
           'Home harbor. The Open Deck hears about it.',
           'Back where we started. The Open Deck hears about it.'
         )::jsonb
   where itinerary::text like '%Home harbor. The Open Deck hears about it.%';
  get diagnostics n = row_count; total := total + n;

  update public.dispatch_posts
     set dek = 'Two cities, nineteen sailings, one crossing.'
   where dek = 'Two harbors, nineteen sailings, one crossing.';
  get diagnostics n = row_count; total := total + n;

  raise notice 'city rename touched % rows', total;
end $$;;
