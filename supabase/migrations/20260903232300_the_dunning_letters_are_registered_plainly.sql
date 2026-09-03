-- Third attempt, and the two failures are worth recording because both were
-- self-inflicted by the explanation rather than the code.
--
-- The registry gate lifts letter codes out of the migrations by finding an
-- insert into the templates table and reading the quoted codes that follow it.
-- Its search for the end of that statement is non-greedy, so it stops at the
-- first semicolon in the file.
--
--   Attempt one put a semicolon inside a description, which ended the block
--   early and hid the last two codes.
--
--   Attempt two explained that by quoting the gate's own pattern in a comment.
--   The gate then matched the COMMENT, found no codes in it at all, and failed
--   the same two letters for a completely different reason.
--
-- So: no semicolons in a description, and no pattern-shaped prose above the
-- statement. Same family as the warning at the top of brand.ts, where the
-- banned-terms extractor stops at the first closing bracket and a comment
-- containing one silently truncated the list.
insert into public.email_templates (code, description, active) values
  ('dues-failed', 'The card was declined. Nothing changes today, and we retry.', true),
  ('card-expiring', 'The card on file expires soon, so replace it before anything skips.', true),
  ('final-notice', 'Last word before a standing pauses, with the date it happens.', true)
on conflict (code) do update set description = excluded.description, active = true;;
