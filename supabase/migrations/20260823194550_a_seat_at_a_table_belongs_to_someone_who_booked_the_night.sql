-- claim_table_seat and confirm_table_seat checked that the caller was signed
-- in and active, and that the table had room. They never checked that the
-- caller was coming to the night at all. Any active member could take a seat
-- at a Table Night they had not booked — burning a seat a paying attendee
-- wanted — and, because at_table() gates the table_seats SELECT policy on
-- merely holding a seat row, read that table's roster. Hopping from table to
-- table enumerated every roster of the evening.
--
-- Ownership of a seat row is not entitlement to the night. The RSVP is.
create or replace function public.has_a_pass_for_the_table(p_table uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.dating_tables t
    join public.rsvps r on r.voyage_id = t.voyage_id
    where t.id = p_table
      and r.profile_id = auth.uid()
      and r.status = 'aboard'
  );
$$;

revoke execute on function public.has_a_pass_for_the_table(uuid) from public, anon;
grant execute on function public.has_a_pass_for_the_table(uuid) to authenticated;

create or replace function public.claim_table_seat(p_table uuid)
returns timestamp with time zone
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  cap integer;
  taken integer;
  until_ts timestamptz;
begin
  if me is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if not public.has_a_pass_for_the_table(p_table) then
    raise exception 'that table belongs to a night you are not booked on';
  end if;

  perform pg_advisory_xact_lock(hashtext('table_seat:' || me::text));

  select seats into cap from public.dating_tables where id = p_table;
  if cap is null then raise exception 'no such table'; end if;

  delete from public.table_seats
  where table_id = p_table and state = 'held' and held_until < now();

  select count(*) into taken from public.table_seats
  where table_id = p_table and (state = 'confirmed' or held_until >= now());
  if taken >= cap then
    raise exception 'that table is full — % seats, all taken', cap;
  end if;

  delete from public.table_seats ts
  using public.dating_tables t, public.dating_tables mine
  where ts.profile_id = me and ts.table_id = t.id and mine.id = p_table
    and t.voyage_id = mine.voyage_id and ts.table_id <> p_table;

  insert into public.table_seats (table_id, profile_id)
  values (p_table, me)
  on conflict (table_id, profile_id)
  do update set held_until = now() + interval '15 minutes'
  where public.table_seats.state = 'held'
  returning held_until into until_ts;

  return until_ts;
end;
$$;

create or replace function public.confirm_table_seat(p_table uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if not public.has_a_pass_for_the_table(p_table) then
    raise exception 'that table belongs to a night you are not booked on';
  end if;

  update public.table_seats
  set state = 'confirmed'
  where table_id = p_table and profile_id = me
    and (state = 'confirmed' or held_until >= now());
  if not found then
    raise exception 'the hold lapsed — claim the seat again';
  end if;
end;
$$;

-- A held seat is not yet a place at the table, and the roster is what the
-- evening is for. Reading it waits for the seat to be confirmed.
create or replace function public.at_table(p_table uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.table_seats
    where table_id = p_table
      and profile_id = auth.uid()
      and state = 'confirmed'
  );
$$;;
