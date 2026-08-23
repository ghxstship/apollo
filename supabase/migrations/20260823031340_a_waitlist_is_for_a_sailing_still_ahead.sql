-- The same partial fix twice: rsvp_not_in_the_past returned early for anything
-- not going 'aboard', so a member could still join the WAITLIST for a sailing
-- that had already happened or been called off. Releasing a pass must keep
-- working on any voyage, so only the two statuses that claim a place are held
-- to the rule.
create or replace function public.rsvp_not_in_the_past()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_starts timestamptz; v_status text;
begin
  if public.is_staff() then return new; end if;
  if new.status not in ('aboard', 'waitlist') then return new; end if;
  if tg_op = 'UPDATE' and old.status = new.status then return new; end if;

  select starts_at, status::text into v_starts, v_status
  from public.voyages where id = new.voyage_id;

  if v_status in ('completed', 'cancelled') then
    raise exception 'that sailing is in the log, not on the manifest';
  end if;
  if v_starts is not null and v_starts <= now() then
    raise exception 'that sailing has already left';
  end if;
  return new;
end;
$$;

revoke execute on function public.rsvp_not_in_the_past() from public, anon, authenticated;

drop trigger if exists rsvp_not_in_the_past on public.rsvps;
create trigger rsvp_not_in_the_past
  before insert or update of status on public.rsvps
  for each row execute function public.rsvp_not_in_the_past();
