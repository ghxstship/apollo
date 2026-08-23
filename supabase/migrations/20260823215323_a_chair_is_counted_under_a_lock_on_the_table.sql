-- claim_table_seat took pg_advisory_xact_lock on the MEMBER, so two members
-- claiming the same table never met. Three passholders filled a two-seat table.
-- And confirm_table_seat had no capacity test at all, so three holds simply
-- became three confirmations. Lock the table, and count again on confirm — a
-- hold is not a place until it is taken up.
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

  perform pg_advisory_xact_lock(hashtext('table:' || p_table::text));

  select seats into cap from public.dating_tables where id = p_table;
  if cap is null then raise exception 'no such table'; end if;

  delete from public.table_seats
  where table_id = p_table and state = 'held' and held_until < now();

  select count(*) into taken from public.table_seats
  where table_id = p_table and profile_id <> me
    and (state = 'confirmed' or held_until >= now());
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
declare me uuid := auth.uid(); cap integer; taken integer;
begin
  if me is null then raise exception 'sign in required'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;
  if not public.has_a_pass_for_the_table(p_table) then
    raise exception 'that table belongs to a night you are not booked on';
  end if;

  perform pg_advisory_xact_lock(hashtext('table:' || p_table::text));

  select seats into cap from public.dating_tables where id = p_table;
  select count(*) into taken from public.table_seats
   where table_id = p_table and profile_id <> me and state = 'confirmed';
  if cap is not null and taken >= cap then
    raise exception 'that table filled while you were deciding — % seats, all taken', cap;
  end if;

  update public.table_seats
  set state = 'confirmed'
  where table_id = p_table and profile_id = me
    and (state = 'confirmed' or held_until >= now());
  if not found then
    raise exception 'the hold lapsed — claim the seat again';
  end if;
end;
$$;;
