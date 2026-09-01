-- An identity record was scheduled for purge only from a member's last
-- COMPLETED sailing, thirty days on. A member who was verified and never sailed
-- therefore had no due date at all, and their identity document was held
-- indefinitely — while the crew screen said "NO PURGE DUE", which reads as
-- reassurance and meant the opposite.
--
-- The owner set the fallback on 2026-08-25: twelve months from verification.
-- Sailing still restarts the clock and still governs when it has sailed, so the
-- thirty-day rule is untouched for anyone who has been aboard. This only
-- catches the case that previously fell through: verified, never sailed.
--
-- Both branches take max() of what applies, so a member who sails after being
-- verified moves to the sailing rule and never backwards.
create or replace function public.purge_spent_identity_records()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  swept integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  -- Recompute the due date from the member's own last completed sailing, so a
  -- member who sails again has their clock restarted rather than their record
  -- swept out from under a live booking.
  update public.vetting_files f
  set id_purge_due = (last_sail.d + interval '30 days')::date
  from (
    select r.profile_id, max(v.starts_at) as d
    from public.rsvps r join public.voyages v on v.id = r.voyage_id
    where r.status = 'aboard' and v.status = 'completed'
    group by r.profile_id
  ) last_sail
  where f.profile_id = last_sail.profile_id
    and f.id_verified_at is not null;

  -- Verified and never sailed: twelve months from the moment identity was
  -- taken. Only where nothing is scheduled already, so it can never pull a
  -- sailing-derived date forward.
  update public.vetting_files f
  set id_purge_due = (f.id_verified_at + interval '12 months')::date
  where f.id_verified_at is not null
    and f.id_purge_due is null
    and not exists (
      select 1 from public.rsvps r join public.voyages v on v.id = r.voyage_id
      where r.profile_id = f.profile_id and r.status = 'aboard' and v.status = 'completed'
    );

  update public.vetting_files
  set id_verified_at = null, id_purge_due = null
  where id_purge_due is not null and id_purge_due <= current_date;
  get diagnostics swept = row_count;

  return swept;
end $function$;

-- A verified record with no purge date is the state this migration exists to
-- make impossible. Asserted after a sweep rather than assumed.
do $$
declare orphaned int;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where is_staff limit 1),
                      'role', 'authenticated')::text, true);
  perform public.purge_spent_identity_records();
  select count(*) into orphaned from public.vetting_files
   where id_verified_at is not null and id_purge_due is null;
  if orphaned > 0 then
    raise exception '% verified identity record(s) are still scheduled for nothing', orphaned;
  end if;
  perform set_config('request.jwt.claims', '', true);
end $$;;
