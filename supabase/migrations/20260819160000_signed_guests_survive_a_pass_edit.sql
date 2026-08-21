-- sync_guest_rows() removes guests dropped from guest_names. With the signature
-- FK now RESTRICT, that delete fails whenever the dropped guest has signed — and
-- because it runs inside a trigger, the whole update to the pass fails with it.
-- A member editing their guest list would have got a foreign-key error from a
-- table they have never heard of, and their edit would not have saved.
--
-- A signature is a record about a person who was really coming. Taking their
-- name off the pass does not unmake it. So a signed guest is kept rather than
-- deleted; only guests who never signed are swept.

create or replace function public.sync_guest_rows()
returns trigger language plpgsql security definer set search_path = public as $$
declare i int; nm text; code text; m text;
begin
  if new.status <> 'aboard' then return new; end if;

  -- Only guests who never signed. One who did is holding a waiver for this
  -- sailing, and the club is holding it back — the row stays.
  delete from public.rsvp_guests g
  where g.rsvp_id = new.id
    and g.name <> all(coalesce(new.guest_names, '{}'))
    and not exists (select 1 from public.signatures s where s.guest_id = g.id);

  select member_no into m from public.profiles where id = new.profile_id;
  i := 0;
  foreach nm in array coalesce(new.guest_names, '{}') loop
    i := i + 1;
    if not exists (select 1 from public.rsvp_guests g where g.rsvp_id = new.id and g.name = nm) then
      code := coalesce(new.boarding_code, 'LS-GUEST') || '-G' || i::text;
      insert into public.rsvp_guests (rsvp_id, name, boarding_code) values (new.id, nm, code)
      on conflict (boarding_code) do nothing;
    end if;
  end loop;
  return new;
end $$;

revoke execute on function public.sync_guest_rows() from public, anon, authenticated;
