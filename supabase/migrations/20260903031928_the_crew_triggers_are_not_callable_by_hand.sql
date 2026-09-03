-- Caught by the e2e suite's trigger_fn_not_granted invariant, and it was right
-- to fail the build over it.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, which in this
-- database means anon. All four of these are SECURITY DEFINER, so anon could
-- have called them directly, out of band, with arguments of its choosing:
--
--   handle_new_crew_candidate  — the worst of them. It inserts into
--     email_outbox, so a direct call is the club's own mail sender addressed by
--     a stranger.
--   open_the_crew_history / log_the_crew_stage_move — write arbitrary rows into
--     an append-only history that exists precisely so it cannot be forged.
--   pace_the_crew_applications — writes status_lookups, so it could be used to
--     pace somebody else out of applying.
--
-- The sibling functions on the member path (pace_the_applications,
-- handle_new_application) were already revoked; these four were written from
-- their shape and inherited everything except this. Revoking from PUBLIC covers
-- anon and authenticated both, and costs the triggers nothing: a trigger is
-- invoked by the executor as the table owner, never through this grant.
revoke execute on function public.pace_the_crew_applications() from public;
revoke execute on function public.handle_new_crew_candidate() from public;
revoke execute on function public.open_the_crew_history() from public;
revoke execute on function public.log_the_crew_stage_move() from public;;
