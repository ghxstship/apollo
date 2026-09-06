-- Two corrections to the pass that added viewer_may_browse and froze the
-- ledger. Both were caught by invariants this suite already holds, which is
-- the system working.

-- 1 ── A sealed view answers empty, not "permission denied".
-- e2e-suite says it in its own words: "Empty, not an error. A 42501 here means
-- anon is being stopped by a missing EXECUTE grant rather than by the policy —
-- which is how the public gallery ended up unable to read its own approved
-- frames." Revoking viewer_may_browse from anon turned member_engagement and
-- member_league from silently empty into a 401 carrying a Postgres error code.
--
-- The function is safe for anon to call: it asks whether the CALLER is a
-- non-departed member, and for anon there is no caller, so it answers false
-- and the view yields nothing. That is the seal working, quietly.
grant execute on function public.viewer_may_browse() to anon;

-- 2 ── A trigger function is nobody's to call directly.
-- A function used only as a trigger keeps Postgres's default PUBLIC EXECUTE
-- unless it is taken away, and this schema holds an invariant that says it
-- must be. a_posted_line_does_not_move shipped with the default.
revoke all on function public.a_posted_line_does_not_move() from public, anon, authenticated;

-- The same default applies to note_cron_skip's siblings; it was already
-- revoked when it was written, and this states the rule where the next reader
-- of either will find it.
comment on function public.a_posted_line_does_not_move() is
  'Trigger only. Not granted to anyone: a trigger function is reached through the write it guards, never called directly.';;
