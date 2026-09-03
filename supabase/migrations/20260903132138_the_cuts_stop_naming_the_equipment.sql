-- Owner ruling, 2026-09-03: the copy stops mentioning cameras. The shows this
-- club is built on never name the equipment — Love Island and Below Deck sell
-- the night, not the rig — and saying it repeatedly is what makes a filmed
-- premise read as a production instead of an evening.
--
-- The cameras page keeps every word of its own, because a consent surface is
-- not marketing: a participant is owed the plain mechanics of what is filmed,
-- and that is the one place the equipment should be named.
--
-- This one is a database row, which makes it the second time a lexicon change
-- has had to be a migration since copy moved into tables. Worth remembering
-- when the next voice pass sweeps the codebase and finds nothing.
update public.episode_cuts
set title = 'What nobody else saw'
where slug = 'confession' and title = 'What the cameras missed';;
