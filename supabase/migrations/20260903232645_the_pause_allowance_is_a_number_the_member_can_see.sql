-- The pause machinery is complete and has been since August: a trigger on
-- profiles.status opens and closes a window in membership_pauses, and
-- membership_pause_days_used counts a rolling year, self-or-staff scoped.
--
-- Nothing has ever called it. So a member pausing has no idea whether they have
-- used three days of their allowance or ninety, and nothing anywhere states
-- what the allowance IS — the ninety days lives in prose, in a document, and in
-- nobody's code.
--
-- A setting rather than a constant, because it is a club policy and the club
-- changes policies without a deploy. Ninety days is what the membership terms
-- already say.
insert into public.club_settings (key, value_int, note) values
  ('pause_days_per_year', 90,
   'Days a member may hold their own membership paused in a rolling year. Read by the pause control, which shows what is left before it asks.')
on conflict (key) do nothing;;
