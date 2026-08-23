-- Guest codes were minted from the guest's POSITION in guest_names. Swap out the
-- guest at position one and add a new one, and the newcomer computes …-G2 —
-- which the surviving guest, previously position two, still holds. The insert hit
-- `on conflict (boarding_code) do nothing` and vanished: no row, no code, no sign
-- token, no error. The manifest read "2 guests" beside a single name and the
-- dropped guest could not board. Fixing the detached-orphan case did not touch
-- this path, because the collision here is with a LIVE guest on the same pass.
create or replace function public.sync_guest_rows()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  nm text; base text; code text; slot int; taken boolean;
begin
  if new.status <> 'aboard' then return new; end if;

  delete from public.rsvp_guests g
  where g.rsvp_id = new.id
    and g.name <> all(coalesce(new.guest_names, '{}'))
    and not exists (select 1 from public.signatures s where s.guest_id = g.id);

  base := coalesce(new.boarding_code, 'SYR-' || upper(left(replace(new.id::text, '-', ''), 8)));

  foreach nm in array coalesce(new.guest_names, '{}') loop
    if not exists (select 1 from public.rsvp_guests g where g.rsvp_id = new.id and g.name = nm) then
      code := null;
      for slot in 1..24 loop
        select exists (
          select 1 from public.rsvp_guests g where g.boarding_code = base || '-G' || slot::text
        ) into taken;
        if not taken then code := base || '-G' || slot::text; exit; end if;
      end loop;
      if code is null then raise exception 'no free guest code left on this pass'; end if;
      insert into public.rsvp_guests (rsvp_id, name, boarding_code) values (new.id, nm, code);
    end if;
  end loop;
  return new;
end $function$;
