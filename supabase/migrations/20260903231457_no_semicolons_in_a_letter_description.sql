-- The route audit refused two of the three letters just added, and the cause
-- was a semicolon in prose.
--
-- The registry check lifts codes out of the migrations with a non-greedy
-- `insert into public.email_templates[\s\S]*?;` — so the block it reads ends at
-- the FIRST semicolon in the file, not at the end of the statement. The first
-- description was "The card was declined. Nothing changes today; we retry.",
-- and that semicolon cut the block off before card-expiring and final-notice
-- were ever seen. Both letters existed, both rendered, both were registered;
-- the gate simply could not read past a piece of punctuation.
--
-- Rewritten without semicolons. Noting the trap rather than only stepping over
-- it: this is the same class of fragility as the BANNED_TERMS extractor, which
-- stops at the first closing bracket and has its own warning at the top of
-- brand.ts. A description here may not contain a semicolon.
insert into public.email_templates (code, description, active) values
  ('dues-failed', 'The card was declined. Nothing changes today, and we retry.', true),
  ('card-expiring', 'The card on file expires soon — replace it before it skips.', true),
  ('final-notice', 'Last word before a standing pauses, with the date it happens.', true)
on conflict (code) do update set description = excluded.description, active = true;;
