-- A seeded Open Deck post still named the Wardroom, the retired name for this
-- very surface. Members write what they write, but content we shipped is our
-- copy and holds to the same lexicon — and it read as a live reference to a
-- place that no longer exists.
update public.wardroom_posts
   set body = replace(body, 'the Wardroom knows', 'the Open Deck knows')
 where body like '%the Wardroom knows%';;
