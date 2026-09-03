-- The lexicon gate caught this on /crew/the-producer-engineering: the process
-- step offered "a paid day on a real ticket", and ticket is a retired word —
-- it was what a pass used to be called, and a job page teaching a candidate the
-- club's dead vocabulary is the exact failure the ban exists to prevent.
--
-- Worth noting where the copy lives now: this is a data fix, not a code one,
-- because the posting is a row. That is the point of the table, and it is also
-- why the gate crawling /crew/[slug] matters — the words are no longer in a
-- file anybody reviews.
update public.crew_roles
set process = array[
  'A call, half an hour, no whiteboard.',
  'A paid day on a real problem in the real codebase.',
  'A conversation about what you found wrong with it, then a decision.'
]
where slug = 'the-producer-engineering';;
