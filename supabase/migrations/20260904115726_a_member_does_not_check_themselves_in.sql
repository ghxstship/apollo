-- "own rsvp update" lets a member write every column of their own pass, and
-- nothing on passes guards the gangway columns: a member can stamp their own
-- checked_in_at (which returns the deposit and banks knots on completion),
-- write their own boarding_code, or re-segment an aboard pass. Proven on the
-- replay by the 2026-09-04 audit. The columns the door owns move only from the
-- Bridge, from a trigger, or through the hand-off, which announces itself with
-- app.accepting_pass.
create or replace function public.guard_the_gangway_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  /* handle_pass_aboard mints the code from inside its own trigger; a nested
     statement is the club's, not the member's. */
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('app.accepting_pass', true), 'off') = 'on' then return new; end if;
  if new.checked_in_at is distinct from old.checked_in_at
     or new.checked_in_by is distinct from old.checked_in_by then
    raise exception 'the gangway checks you in, not the other way round';
  end if;
  if new.boarding_code is distinct from old.boarding_code then
    raise exception 'a boarding code is issued by the club';
  end if;
  if new.vessel_id is distinct from old.vessel_id then
    raise exception 'the Bridge assigns hulls';
  end if;
  if new.segment is distinct from old.segment
     and old.status = 'aboard' and new.status = 'aboard' then
    raise exception 'a pass keeps the segment it was booked in — release it and book again';
  end if;
  return new;
end $function$;

revoke all on function public.guard_the_gangway_columns() from public, anon, authenticated;

drop trigger if exists guard_the_gangway_columns on public.passes;
create trigger guard_the_gangway_columns
  before update of checked_in_at, checked_in_by, boarding_code, vessel_id, segment on public.passes
  for each row execute function public.guard_the_gangway_columns();;
