-- Making these triggers fire on profile_id stopped the OLD holder keeping a
-- crew seat and a chair they no longer had a pass for. It did not give either
-- to the new one, because on_rsvp_join_crew and handle_rsvp_aboard both watch
-- `status` and a hand-off writes only profile_id. So after a transfer the crew
-- thread for that sailing ended with nobody in it, the table seat was gone
-- rather than reassigned, and the taker got no Knots while the giver's were
-- reversed — the pass arrived stripped of everything that came with it.
--
-- A hand-off moves what the pass carries.
create or replace function public.crew_seat_follows_the_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare gone uuid; handed boolean := false;
begin
  if tg_op = 'DELETE' then
    gone := old.profile_id;
  elsif old.profile_id is distinct from new.profile_id then
    gone := old.profile_id; handed := true;
  elsif old.status = 'aboard' and new.status <> 'aboard' then
    gone := old.profile_id;
  else
    return coalesce(new, old);
  end if;

  if not exists (
    select 1 from public.rsvps r
    where r.profile_id = gone and r.voyage_id = old.voyage_id
      and r.status = 'aboard' and r.id <> old.id
  ) then
    -- The chair moves with the pass rather than being thrown away.
    if handed and new.status = 'aboard' then
      update public.table_seats ts
         set profile_id = new.profile_id
        from public.dating_tables dt
       where dt.id = ts.table_id
         and dt.voyage_id = old.voyage_id
         and ts.profile_id = gone
         and not exists (
           select 1 from public.table_seats other
           where other.table_id = ts.table_id and other.profile_id = new.profile_id
         );
    end if;

    delete from public.thread_members tm
    using public.threads t
    where tm.thread_id = t.id
      and t.kind = 'crew'
      and t.voyage_id = old.voyage_id
      and tm.profile_id = gone;

    delete from public.table_seats ts
    using public.dating_tables dt
    where dt.id = ts.table_id
      and dt.voyage_id = old.voyage_id
      and ts.profile_id = gone;
  end if;

  -- And the taker joins the crew, which nothing else was going to do for them.
  if handed and new.status = 'aboard' then
    insert into public.thread_members (thread_id, profile_id)
    select t.id, new.profile_id
    from public.threads t
    where t.kind = 'crew' and t.voyage_id = old.voyage_id
    on conflict do nothing;
  end if;

  return coalesce(new, old);
end;
$$;

-- Knots follow too: reversed off the giver, awarded to the taker.
create or replace function public.return_knots_with_the_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare gone uuid; handed boolean := false; awarded int;
begin
  if tg_op = 'DELETE' then
    gone := old.profile_id;
  elsif old.profile_id is distinct from new.profile_id then
    gone := old.profile_id; handed := true;
  elsif old.status = 'aboard' and new.status <> 'aboard' then
    gone := old.profile_id;
  else
    return coalesce(new, old);
  end if;

  if not exists (
    select 1 from public.rsvps r
    where r.profile_id = gone and r.voyage_id = old.voyage_id
      and r.status = 'aboard' and r.id <> old.id
  ) then
    select coalesce(sum(delta), 0) into awarded
    from public.fathoms_ledger
    where profile_id = gone and voyage_id = old.voyage_id
      and reason in ('Berth confirmed', 'Pass confirmed', 'Pass released');

    if awarded > 0 then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (gone, -awarded, 'Pass released', old.voyage_id);
    end if;
  end if;

  if handed and new.status = 'aboard' then
    if not exists (
      select 1 from public.fathoms_ledger
      where profile_id = new.profile_id and voyage_id = old.voyage_id
        and reason in ('Berth confirmed', 'Pass confirmed')
    ) then
      insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
      values (new.profile_id, 25, 'Pass confirmed', old.voyage_id);
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- Re-booking a sailing you released left you aboard with nothing: the
-- first-time test looked for the EXISTENCE of a 'Pass confirmed' row, and the
-- reversal does not remove it. Ask the balance instead.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_rsvp_aboard' limit 1;

  newsrc := replace(src,
    E'    v_first_time := not exists (\n      select 1 from public.fathoms_ledger\n      where profile_id = new.profile_id and voyage_id = new.voyage_id\n        and reason in (''Berth confirmed'',''Pass confirmed'')\n    );',
    E'    -- Net, not existence: the release reversal leaves the original row in\n    -- place, so "have they ever been awarded?" answered yes forever and a\n    -- member who released and re-booked sailed for no Knots at all.\n    select coalesce(sum(delta), 0) <= 0 into v_first_time\n    from public.fathoms_ledger\n    where profile_id = new.profile_id and voyage_id = new.voyage_id\n      and reason in (''Berth confirmed'',''Pass confirmed'',''Pass released'');');

  if newsrc = src then
    raise exception 'could not find the v_first_time test in handle_rsvp_aboard';
  end if;
  execute newsrc;
end $outer$;;
