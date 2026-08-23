-- After a host releases their pass, the guest row survives with rsvp_id and
-- boarding_code nulled: a named person, attached to nothing. The host who typed
-- that name cannot remove it — DELETE returns 200 [] — while the membership
-- agreement promises a member may "ask for it to be erased".
--
-- A guest who signed is a record and stays. A guest who never signed is just a
-- name someone typed, and the person who typed it may take it back.

-- The column first: a detached row otherwise loses every link back to who
-- named it, so nobody could be shown to own one.
alter table public.rsvp_guests
  add column if not exists seated_by uuid references public.profiles(id);

update public.rsvp_guests g
   set seated_by = r.profile_id
  from public.rsvps r
 where r.id = g.rsvp_id and g.seated_by is null;

drop policy if exists "erase a guest who never signed" on public.rsvp_guests;
create policy "erase a guest who never signed" on public.rsvp_guests
  for delete to authenticated
  using (
    public.is_staff()
    or (
      not exists (select 1 from public.signatures s where s.guest_id = rsvp_guests.id)
      and (
        exists (select 1 from public.rsvps r
                 where r.id = rsvp_guests.rsvp_id and r.profile_id = auth.uid())
        or (rsvp_guests.rsvp_id is null and rsvp_guests.seated_by = auth.uid())
      )
    )
  );

do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'guard_guest_row' limit 1;

  newsrc := replace(src,
    '  new.sign_token := gen_random_uuid();',
    '  new.seated_by := auth.uid();' || chr(10) || '  new.sign_token := gen_random_uuid();');

  if newsrc = src then
    raise exception 'could not stamp seated_by in guard_guest_row';
  end if;
  execute newsrc;
end $outer$;

-- An offer arrived nowhere. Making one wrote no notification and there was no
-- trigger on the table, so a pass could be handed to a member who never learned
-- of it unless they happened to open /manifest; declining told the offerer
-- nothing at all — the offer simply vanished off their card.
create or replace function public.word_on_a_pass_offer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_title text; who text;
begin
  select v2.title into v_title from public.rsvps r
    join public.voyages v2 on v2.id = r.voyage_id
   where r.id = new.rsvp_id;

  if tg_op = 'INSERT' and new.status = 'offered' then
    select coalesce(full_name, 'A member') into who from public.profiles where id = new.from_profile;
    insert into public.notifications (profile_id, kind, title, body)
    values (new.to_profile, 'manifest',
            who || ' offered you a pass.',
            'On ' || coalesce(v_title, 'a sailing') || '. Take it or decline it from your manifest.');
  elsif tg_op = 'UPDATE' and old.status = 'offered' and new.status = 'declined' then
    select coalesce(full_name, 'A member') into who from public.profiles where id = new.to_profile;
    insert into public.notifications (profile_id, kind, title, body)
    values (new.from_profile, 'manifest',
            who || ' declined your pass.',
            'It is still yours, on ' || coalesce(v_title, 'that sailing') || '.');
  end if;
  return new;
end;
$$;

revoke execute on function public.word_on_a_pass_offer() from public, anon, authenticated;

drop trigger if exists word_on_a_pass_offer on public.pass_transfers;
create trigger word_on_a_pass_offer
  after insert or update of status on public.pass_transfers
  for each row execute function public.word_on_a_pass_offer();;
