/* Two things the suite's own instruments caught in the remediation batch.

   1. Postgres grants EXECUTE on a new function to PUBLIC by default, and the
      schema invariant (rightly) refuses a trigger function anon can call.
      The four guards from this batch are sealed like every other trigger in
      the corpus.

   2. The Preference Sheet check on the vetting door refused STAFF seatings —
      including a paused member the crew comps aboard, who structurally cannot
      file a sheet while paused (the hold gates member writes). The file
      checks stay universal — crew are not exempt from identity, age, or
      clearance — but the sheet is the member's own instrument, and a crew
      decision to seat someone is a crew decision. */

revoke all on function public.voyage_status_is_a_course() from public, anon, authenticated;
revoke all on function public.the_knots_leave_before_the_ship() from public, anon, authenticated;
revoke all on function public.the_hull_holds_forty() from public, anon, authenticated;
revoke all on function public.a_stage_is_earned_in_order() from public, anon, authenticated;

do $mig$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'guard_the_vetting';
  patched := replace(src,
$a$  if not exists (
    select 1 from public.preference_sheets s
    where s.profile_id = new.profile_id and s.completed_at is not null
  ) then$a$,
$b$  if not public.is_staff() and not exists (
    select 1 from public.preference_sheets s
    where s.profile_id = new.profile_id and s.completed_at is not null
  ) then$b$);
  if patched = src then raise exception 'the sheet-gate patch anchored on nothing'; end if;
  execute patched;
end $mig$;;
