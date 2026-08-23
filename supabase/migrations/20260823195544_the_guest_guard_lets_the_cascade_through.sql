-- rsvp_guests.rsvp_id is ON DELETE SET NULL: deleting a pass detaches its
-- guests so the signed waiver survives as a record. guard_guest_columns
-- refused any change to rsvp_id — including that one, because a cascade runs
-- as whoever did the delete. So a member who had seated a guest could never
-- delete their own pass, and staff could not remove a sailing that had any.
-- The second guard in this session to block the operation it was written to
-- protect.
--
-- Detaching TO NULL is the foreign key's own doing. Moving a guest onto a
-- different pass is what the rule was about.
create or replace function public.guard_guest_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  if coalesce(current_setting('app.guest_signing', true), 'off') = 'on' then
    return new;
  end if;

  if new.on_camera is distinct from old.on_camera then
    raise exception 'that is the guest''s to say, not yours';
  end if;

  if new.boarding_code is distinct from old.boarding_code
     or new.sign_token is distinct from old.sign_token then
    raise exception 'a guest pass is issued by the club';
  end if;

  -- The pass going away takes the seat with it; the guest is not moved.
  if new.rsvp_id is distinct from old.rsvp_id and new.rsvp_id is not null then
    raise exception 'a guest pass is issued by the club';
  end if;

  return new;
end;
$$;;
