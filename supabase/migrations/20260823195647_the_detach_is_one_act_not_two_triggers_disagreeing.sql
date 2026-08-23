-- Still refused after letting the NULL through, and for the reason this
-- session keeps finding: two BEFORE UPDATE triggers on one table, resolved by
-- the alphabet. detached_guest_returns_its_code runs first and clears
-- boarding_code so the code goes back in the pool; guard_guest_columns then
-- sees boarding_code change and raises "a guest pass is issued by the club".
-- The guard was rejecting its own sibling's work, and a member with a seated
-- guest still could not release their pass.
--
-- Detaching is a single act. Recognise it once, at the top, and let the
-- trigger that owns it finish.
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

  -- The pass went away and took the seat with it. That is the foreign key's
  -- doing, and detached_guest_returns_its_code handles what follows.
  if old.rsvp_id is not null and new.rsvp_id is null then
    return new;
  end if;

  if new.on_camera is distinct from old.on_camera then
    raise exception 'that is the guest''s to say, not yours';
  end if;

  if new.boarding_code is distinct from old.boarding_code
     or new.sign_token is distinct from old.sign_token
     or new.rsvp_id is distinct from old.rsvp_id then
    raise exception 'a guest pass is issued by the club';
  end if;

  return new;
end;
$$;;
