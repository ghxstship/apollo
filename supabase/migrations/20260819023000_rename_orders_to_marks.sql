-- "Orders" already means Chandlery purchase orders in the Bridge, and a club
-- this careful about its lexicon cannot carry two meanings on one word. The
-- award concept becomes Marks — in navigation a mark is a fixed point you round
-- on your way somewhere, which is exactly what these are.

alter table public.orders rename to marks;
alter table public.member_orders rename to member_marks;
alter table public.member_marks rename column order_code to mark_code;

alter index if exists member_orders_profile_idx rename to member_marks_profile_idx;

-- Policies carry the old noun in their names; rename by recreating.
drop policy if exists "orders readable" on public.marks;
drop policy if exists "orders staff writes" on public.marks;
drop policy if exists "member orders readable" on public.member_marks;

create policy "marks readable" on public.marks
  for select using (active or public.is_staff());

create policy "marks staff writes" on public.marks
  for all using (public.is_staff()) with check (public.is_staff());

create policy "member marks readable" on public.member_marks
  for select using (
    profile_id = auth.uid()
    or public.is_staff()
    or exists (select 1 from public.profiles p where p.id = profile_id and p.in_directory)
  );

drop function if exists public.confer_orders(uuid);

create or replace function public.confer_marks(p_profile_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  conferred integer := 0;
begin
  with sail as (
    select v.id, v.harbor_id, v.distance_nm, v.starts_at, v.ends_at, r.vessel_id
    from public.rsvps r
    join public.voyages v on v.id = r.voyage_id
    where r.profile_id = p_profile_id
      and r.status = 'aboard'
      and v.status = 'completed'
  ),
  stat as (
    select
      (select count(*) from sail) as sailings,
      (select coalesce(sum(s.distance_nm), 0) from sail s) as nm,
      (select count(distinct s.harbor_id) from sail s where s.harbor_id is not null) as harbors,
      (select count(distinct s.vessel_id) from sail s where s.vessel_id is not null) as vessels,
      (select count(*) from sail s where s.distance_nm >= 25) as bluewater,
      (select count(*) from sail s
        where s.ends_at is not null and s.ends_at - s.starts_at >= interval '8 hours') as longrun,
      (select count(*) from sail s
        where s.ends_at is not null
          and (s.ends_at at time zone 'UTC')::date > (s.starts_at at time zone 'UTC')::date) as nightrun,
      (select count(distinct r2.profile_id) from public.rsvps r2
        where r2.voyage_id in (select s.id from sail s)
          and r2.status = 'aboard'
          and r2.profile_id <> p_profile_id) as crew_met,
      (select count(*) from public.harbors where status = 'open') as open_harbors,
      (select count(*) from public.vessels where active) as active_vessels
  ),
  earned as (
    select m.code
    from public.marks m cross join stat s
    where m.active and case m.code
      when 'first-watch'     then s.sailings >= 1
      when 'sea-legs'        then s.sailings >= 3
      when 'blue-water'      then s.bluewater >= 1
      when 'long-passage'    then s.longrun >= 1
      when 'night-reckoning' then s.nightrun >= 1
      when 'the-hundred'     then s.nm >= 100
      when 'ships-company'   then s.crew_met >= 25
      when 'full-compass'    then s.open_harbors >= 2 and s.harbors >= s.open_harbors
      when 'whole-fleet'     then s.active_vessels >= 2 and s.vessels >= s.active_vessels
      else false
    end
  ),
  ins as (
    insert into public.member_marks (profile_id, mark_code)
    select p_profile_id, e.code from earned e
    on conflict (profile_id, mark_code) do nothing
    returning mark_code
  )
  insert into public.notifications (profile_id, kind, title, body)
  select p_profile_id, 'word', 'Mark rounded — ' || m.name, m.blurb
  from ins i join public.marks m on m.code = i.mark_code;

  get diagnostics conferred = row_count;
  return conferred;
end;
$$;

revoke execute on function public.confer_marks(uuid) from public, anon, authenticated;

create or replace function public.confer_marks_on_completion()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  m uuid;
begin
  if new.status = 'completed' and coalesce(old.status::text, '') <> 'completed' then
    for m in
      select distinct profile_id from public.rsvps
      where voyage_id = new.id and status = 'aboard'
    loop
      perform public.confer_marks(m);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists on_voyage_completed_confer_orders on public.voyages;
drop function if exists public.confer_orders_on_completion();

drop trigger if exists on_voyage_completed_confer_marks on public.voyages;
create trigger on_voyage_completed_confer_marks
after update of status on public.voyages
for each row execute function public.confer_marks_on_completion();

-- passage_log and season_card both counted from the renamed tables. Renaming an
-- OUT parameter changes the return row type, which create-or-replace cannot do,
-- so both are dropped first.
drop function if exists public.passage_log(uuid);
create or replace function public.passage_log(p_profile_id uuid)
returns table (
  sailings integer,
  nm_logged numeric,
  hours_at_sea numeric,
  harbors_made integer,
  vessels_sailed integer,
  crew_met integer,
  first_sail_at timestamptz,
  marks_held integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  if p_profile_id <> auth.uid()
     and not public.is_staff()
     and not exists (
       select 1 from public.profiles p where p.id = p_profile_id and p.in_directory
     )
  then
    raise exception 'not visible';
  end if;

  return query
  with sail as (
    select v.id, v.harbor_id, v.distance_nm, v.starts_at, v.ends_at, r.vessel_id
    from public.rsvps r
    join public.voyages v on v.id = r.voyage_id
    where r.profile_id = p_profile_id
      and r.status = 'aboard'
      and v.status = 'completed'
  )
  select
    (select count(*) from sail)::integer,
    (select coalesce(sum(s.distance_nm), 0) from sail s)::numeric,
    (select coalesce(sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600), 0)
       from sail s where s.ends_at is not null)::numeric,
    (select count(distinct s.harbor_id) from sail s where s.harbor_id is not null)::integer,
    (select count(distinct s.vessel_id) from sail s where s.vessel_id is not null)::integer,
    (select count(distinct r2.profile_id) from public.rsvps r2
      where r2.voyage_id in (select s.id from sail s)
        and r2.status = 'aboard'
        and r2.profile_id <> p_profile_id)::integer,
    (select min(s.starts_at) from sail s),
    (select count(*) from public.member_marks mm where mm.profile_id = p_profile_id)::integer;
end;
$$;

revoke execute on function public.passage_log(uuid) from public, anon;
grant execute on function public.passage_log(uuid) to authenticated;

drop function if exists public.season_card(uuid, timestamptz, timestamptz);
create or replace function public.season_card(
  p_profile_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  sailings      integer,
  nm_logged     numeric,
  harbors       integer,
  crew_met      integer,
  knots_earned  integer,
  marks_won     text[],
  longest_nm    numeric,
  longest_title text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if p_profile_id <> auth.uid() and not public.is_staff() then
    raise exception 'not visible';
  end if;

  return query
  with sail as (
    select v.id, v.title, v.harbor_id, v.distance_nm
    from public.rsvps r
    join public.voyages v on v.id = r.voyage_id
    where r.profile_id = p_profile_id
      and r.status = 'aboard'
      and v.status = 'completed'
      and v.starts_at >= p_from
      and v.starts_at < p_to
  )
  select
    (select count(*) from sail)::integer,
    (select coalesce(sum(s.distance_nm), 0) from sail s)::numeric,
    (select count(distinct s.harbor_id) from sail s where s.harbor_id is not null)::integer,
    (select count(distinct r2.profile_id) from public.rsvps r2
      where r2.voyage_id in (select s.id from sail s)
        and r2.status = 'aboard'
        and r2.profile_id <> p_profile_id)::integer,
    (select coalesce(sum(f.delta), 0) from public.fathoms_ledger f
      where f.profile_id = p_profile_id and f.delta > 0
        and f.created_at >= p_from and f.created_at < p_to)::integer,
    (select coalesce(array_agg(m.name order by m.position), '{}')
      from public.member_marks mm
      join public.marks m on m.code = mm.mark_code
      where mm.profile_id = p_profile_id
        and mm.conferred_at >= p_from and mm.conferred_at < p_to),
    (select max(s.distance_nm) from sail s),
    (select s.title from sail s order by s.distance_nm desc nulls last limit 1);
end;
$$;

revoke execute on function public.season_card(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.season_card(uuid, timestamptz, timestamptz) to authenticated;
