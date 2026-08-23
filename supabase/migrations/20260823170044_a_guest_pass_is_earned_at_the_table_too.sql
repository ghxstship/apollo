-- The guest rule lived on rsvps.guest_names and nowhere else. rsvp_guests is a
-- table with its own INSERT policy, and that policy asked only "is this pass
-- yours?" — so a member on any tier could POST straight to it and receive a
-- live sign_token, skipping the Global requirement, the two-seat cap, and the
-- server-side minting of the boarding code. Ownership is not entitlement.
--
-- The gate moves onto the row itself, where every writer must pass it.
create or replace function public.guard_guest_row()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_owner uuid; v_tier text; v_seated int; v_base text; v_slot int; v_taken boolean;
begin
  if public.is_staff() then return new; end if;

  select r.profile_id, p.tier::text, r.boarding_code
    into v_owner, v_tier, v_base
  from public.rsvps r join public.profiles p on p.id = r.profile_id
  where r.id = new.rsvp_id;

  if v_owner is null then raise exception 'no such pass'; end if;
  if v_owner <> auth.uid() then raise exception 'that pass is not yours'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;

  if v_tier is distinct from 'global' then
    raise exception 'guest passes ride on Global memberships';
  end if;

  select count(*) into v_seated from public.rsvp_guests g where g.rsvp_id = new.rsvp_id;
  if v_seated >= 2 then raise exception 'two guest passes per member'; end if;

  -- The code and the token are issued, never supplied.
  v_base := coalesce(v_base, 'SYR-' || upper(left(replace(new.rsvp_id::text, '-', ''), 8)));
  new.boarding_code := null;
  for v_slot in 1..24 loop
    select exists (
      select 1 from public.rsvp_guests g where g.boarding_code = v_base || '-G' || v_slot::text
    ) into v_taken;
    if not v_taken then
      new.boarding_code := v_base || '-G' || v_slot::text;
      exit;
    end if;
  end loop;
  if new.boarding_code is null then raise exception 'no free guest code left on this pass'; end if;

  new.sign_token := gen_random_uuid();
  new.checked_in_at := null;
  new.checked_in_by := null;
  new.on_camera := false;
  return new;
end;
$$;

revoke execute on function public.guard_guest_row() from public, anon, authenticated;

drop trigger if exists guard_guest_row on public.rsvp_guests;
create trigger guard_guest_row
  before insert on public.rsvp_guests
  for each row execute function public.guard_guest_row();
