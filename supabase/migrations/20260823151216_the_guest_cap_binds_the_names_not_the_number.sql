-- The guest rules were enforced on rsvps.guests, an integer, while the actual
-- guest passes are minted from rsvps.guest_names by a different trigger on a
-- different column list. rsvp_guard_check fires ON (status, guests), so patching
-- guest_names alone never ran it: a regional member with guests = 0 wrote names
-- and got working boarding codes and sign tokens.
--
-- (Superseded within the same round by the refuse-rather-than-zero version.)
create or replace function public.guard_guest_names()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_tier text; v_count int;
begin
  if public.is_staff() then
    new.guests := coalesce(array_length(new.guest_names, 1), 0);
    return new;
  end if;
  v_count := coalesce(array_length(new.guest_names, 1), 0);
  if v_count > 0 then
    select tier::text into v_tier from public.profiles where id = new.profile_id;
    if v_tier is distinct from 'global' then
      raise exception 'guest passes ride on Global memberships';
    end if;
  end if;
  if v_count > 2 then raise exception 'two guest passes per member'; end if;
  new.guests := v_count;
  return new;
end;
$$;

revoke execute on function public.guard_guest_names() from public, anon, authenticated;

drop trigger if exists guard_guest_names on public.rsvps;
create trigger guard_guest_names
  before insert or update of guest_names, guests on public.rsvps
  for each row execute function public.guard_guest_names();
