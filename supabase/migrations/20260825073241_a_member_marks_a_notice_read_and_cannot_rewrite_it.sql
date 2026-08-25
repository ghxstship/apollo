-- RESTORING WHAT I BROKE, and naming the mechanism because it is subtle enough
-- to break again.
--
-- Two tables in this schema are protected by COLUMN-LEVEL grants, not by
-- policies and not by triggers:
--
--   grant update (read)          on public.notifications  to authenticated
--   grant update (last_read_at)  on public.thread_members to authenticated
--
-- The RLS policies on both are deliberately permissive on the row — "own
-- notifications", "mark own thread read", both `profile_id = auth.uid()` — and
-- the COLUMN grant is the thing that says a member may mark a notice read and
-- may not rewrite what it says. There is no trigger. There never was.
--
-- Fixing the default-privilege hole, I ran a loop granting INSERT/UPDATE/DELETE
-- on every table to `authenticated`, which replaced both column-scoped grants
-- with table-wide ones. A member could then PATCH the TITLE of their own
-- notification — verified, and the e2e suite caught it inside one run. Worse,
-- the value I found in place when I checked was "E2E FORGED", so a previous run
-- had already written through the hole and left it there.
--
-- My follow-up revoke did not catch it either: I revoked only where NO policy
-- existed for a command, and notifications HAS an update policy. The grant I
-- had to remove was not the one I was looking for.
--
-- Recovered from the migration corpus rather than from memory — both statements
-- are in the applied history, which is the only reason this was recoverable at
-- all. I did not snapshot the grants before overwriting them, and that is the
-- lesson worth more than the fix.
revoke update on public.notifications from authenticated;
revoke update on public.thread_members from authenticated;

grant update (read) on public.notifications to authenticated;
grant update (last_read_at) on public.thread_members to authenticated;
;
