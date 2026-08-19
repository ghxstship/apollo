-- Gamification, in the club's own register: a logbook, not a leaderboard.
--
-- Four pieces, in dependency order:
--   1. passage_log()  — what a member has actually done, derived, never stored
--   2. orders         — permanent marks for firsts and crossings, conferred by trigger
--   3. knot_offers    — a sink for Knots, which until now only ever went up
--   4. contests       — regattas (ranked, bounded) and challenges (target), one engine
--
-- The rule the whole file obeys: reward accumulated history, never rank members
-- against each other in perpetuity. Regattas finish. Orders are yours forever.

-- ===== 1. The Passage Log =====================================================

-- A member's record, computed on read. Definer, because a member's sailings are
-- their own rows under RLS and the directory is allowed to show the totals —
-- aggregates only, and only for members who opted into the directory.
create or replace function public.passage_log(p_profile_id uuid)
returns table (
  sailings integer,
  nm_logged numeric,
  hours_at_sea numeric,
  harbors_made integer,
  vessels_sailed integer,
  crew_met integer,
  first_sail_at timestamptz,
  orders_held integer
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required';
  end if;
  -- Your own log always. Anyone else's only if they chose to be listed.
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
    (select count(*) from public.member_orders mo where mo.profile_id = p_profile_id)::integer;
end;
$$;

revoke execute on function public.passage_log(uuid) from public, anon;
grant execute on function public.passage_log(uuid) to authenticated;

-- ===== 2. Orders ==============================================================

-- Naval tradition confers a mark for a first or a crossing and it is yours for
-- good. No expiry, no decay, no ranking — the opposite of a points balance.
create table if not exists public.orders (
  code      text primary key,
  name      text not null,
  blurb     text not null,
  -- How it reads to a member, not how it is computed: a first, a collection
  -- completed, or a tally crossed.
  kind      text not null check (kind in ('first', 'collection', 'tally')),
  position  integer not null default 0,
  active    boolean not null default true
);

create table if not exists public.member_orders (
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  order_code   text not null references public.orders (code) on delete cascade,
  conferred_at timestamptz not null default now(),
  primary key (profile_id, order_code)
);

create index if not exists member_orders_profile_idx on public.member_orders (profile_id);

alter table public.orders enable row level security;
alter table public.member_orders enable row level security;

-- The catalogue is public: knowing what can be earned is part of the draw.
drop policy if exists "orders readable" on public.orders;
create policy "orders readable" on public.orders
  for select using (active or public.is_staff());

drop policy if exists "orders staff writes" on public.orders;
create policy "orders staff writes" on public.orders
  for all using (public.is_staff()) with check (public.is_staff());

-- Marks are visible on a member who is in the directory, and always to their
-- owner. Nobody writes this table by hand — conferral is definer-only.
drop policy if exists "member orders readable" on public.member_orders;
create policy "member orders readable" on public.member_orders
  for select using (
    profile_id = auth.uid()
    or public.is_staff()
    or exists (select 1 from public.profiles p where p.id = profile_id and p.in_directory)
  );

insert into public.orders (code, name, blurb, kind, position) values
  ('first-watch',     'First Watch',      'Your first sailing, completed.', 'first', 1),
  ('sea-legs',        'Sea Legs',         'Three sailings behind you.', 'tally', 2),
  ('blue-water',      'Blue Water',       'A single passage of twenty-five nautical miles or more.', 'first', 3),
  ('long-passage',    'The Long Passage', 'A sailing that ran over eight hours.', 'first', 4),
  ('night-reckoning', 'Night Reckoning',  'A sailing that carried past midnight.', 'first', 5),
  ('the-hundred',     'The Hundred',      'One hundred nautical miles logged with the club.', 'tally', 6),
  ('ships-company',   'Ship''s Company',  'Sailed with twenty-five distinct members.', 'tally', 7),
  ('full-compass',    'Full Compass',     'Sailed out of every open harbor.', 'collection', 8),
  ('whole-fleet',     'The Whole Fleet',  'Sailed aboard every active hull.', 'collection', 9)
on conflict (code) do update
  set name = excluded.name, blurb = excluded.blurb,
      kind = excluded.kind, position = excluded.position;

-- Conferral. Rules live in SQL rather than a stored expression language: there
-- are nine of them, they change rarely, and an evaluator that reads text from a
-- table is a much larger attack surface than a CASE.
create or replace function public.confer_orders(p_profile_id uuid)
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
    select o.code
    from public.orders o cross join stat s
    where o.active and case o.code
      when 'first-watch'     then s.sailings >= 1
      when 'sea-legs'        then s.sailings >= 3
      when 'blue-water'      then s.bluewater >= 1
      when 'long-passage'    then s.longrun >= 1
      when 'night-reckoning' then s.nightrun >= 1
      when 'the-hundred'     then s.nm >= 100
      when 'ships-company'   then s.crew_met >= 25
      -- A collection is only an achievement if there is something to collect;
      -- with one open harbor "every harbor" would confer on the first sail.
      when 'full-compass'    then s.open_harbors >= 2 and s.harbors >= s.open_harbors
      when 'whole-fleet'     then s.active_vessels >= 2 and s.vessels >= s.active_vessels
      else false
    end
  ),
  ins as (
    insert into public.member_orders (profile_id, order_code)
    select p_profile_id, e.code from earned e
    on conflict (profile_id, order_code) do nothing
    returning order_code
  )
  insert into public.notifications (profile_id, kind, title, body)
  select p_profile_id, 'word', 'Order conferred — ' || o.name, o.blurb
  from ins i join public.orders o on o.code = i.order_code;

  get diagnostics conferred = row_count;
  return conferred;
end;
$$;

revoke execute on function public.confer_orders(uuid) from public, anon, authenticated;

-- Orders are earned by sailing, so they are evaluated when a sailing lands.
create or replace function public.confer_orders_on_completion()
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
      perform public.confer_orders(m);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists on_voyage_completed_confer_orders on public.voyages;
create trigger on_voyage_completed_confer_orders
after update of status on public.voyages
for each row execute function public.confer_orders_on_completion();

-- ===== 3. A sink for Knots ====================================================

-- Knots have only ever gone up: ~5,020 earned against 250 ever spent. A currency
-- with no sink is decoration. These are the things it buys.
create table if not exists public.knot_offers (
  code     text primary key,
  name     text not null,
  blurb    text not null,
  cost     integer not null check (cost > 0),
  kind     text not null check (kind in ('access', 'guest', 'hold', 'chandlery')),
  stock    integer check (stock is null or stock >= 0),  -- null = unlimited
  position integer not null default 0,
  active   boolean not null default true
);

create table if not exists public.knot_redemptions (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles (id) on delete cascade,
  offer_code   text not null references public.knot_offers (code),
  cost         integer not null,
  created_at   timestamptz not null default now(),
  fulfilled_at timestamptz,
  note         text
);

create index if not exists knot_redemptions_profile_idx on public.knot_redemptions (profile_id);
create index if not exists knot_redemptions_offer_idx on public.knot_redemptions (offer_code);

alter table public.knot_offers enable row level security;
alter table public.knot_redemptions enable row level security;

drop policy if exists "offers readable" on public.knot_offers;
create policy "offers readable" on public.knot_offers
  for select using (active or public.is_staff());

drop policy if exists "offers staff writes" on public.knot_offers;
create policy "offers staff writes" on public.knot_offers
  for all using (public.is_staff()) with check (public.is_staff());

-- Own redemptions, plus staff who have to fulfil them. No INSERT policy: the
-- only way to spend Knots is through redeem_knot_offer, which checks the balance.
drop policy if exists "own or staff redemptions" on public.knot_redemptions;
create policy "own or staff redemptions" on public.knot_redemptions
  for select using (profile_id = auth.uid() or public.is_staff());

drop policy if exists "staff fulfils redemptions" on public.knot_redemptions;
create policy "staff fulfils redemptions" on public.knot_redemptions
  for update using (public.is_staff()) with check (public.is_staff());

insert into public.knot_offers (code, name, blurb, cost, kind, stock, position) values
  ('first-call',    'First call on scarce passes',
   'Your name goes to the front of the next release, once.', 250, 'access', null, 1),
  ('guest-pass',    'A guest pass',
   'Bring someone. One pass, any Port Day, subject to room.', 400, 'guest', null, 2),
  ('hold-a-pass',   'Hold a pass past release',
   'Your pass stays held twenty-four hours past the release deadline.', 150, 'hold', null, 3),
  ('cabin-choice',  'Choice of cabin',
   'Pick your cabin on a Sea Day before the flotilla is assigned.', 300, 'access', null, 4),
  ('chandlery-25',  'Twenty-five dollars at the Chandlery',
   'Credit against anything on the shelf.', 500, 'chandlery', null, 5)
on conflict (code) do update
  set name = excluded.name, blurb = excluded.blurb, cost = excluded.cost,
      kind = excluded.kind, position = excluded.position;

create or replace function public.redeem_knot_offer(p_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  me    uuid := auth.uid();
  offer public.knot_offers;
  bal   integer;
  taken integer;
  rid   uuid;
begin
  if me is null then raise exception 'sign in required'; end if;

  -- Serialise this member's spending so two tabs cannot both pass the balance
  -- check and overdraw. Transaction-scoped; released on commit or rollback.
  perform pg_advisory_xact_lock(hashtext(me::text));

  select * into offer from public.knot_offers where code = p_code and active;
  if not found then raise exception 'no such offer'; end if;

  select coalesce(sum(delta), 0) into bal
  from public.fathoms_ledger where profile_id = me;
  if bal < offer.cost then
    raise exception 'not enough knots: % held, % needed', bal, offer.cost;
  end if;

  if offer.stock is not null then
    select count(*) into taken from public.knot_redemptions where offer_code = offer.code;
    if taken >= offer.stock then raise exception 'offer exhausted'; end if;
  end if;

  insert into public.fathoms_ledger (profile_id, delta, reason)
  values (me, -offer.cost, 'Redeemed — ' || offer.name);

  insert into public.knot_redemptions (profile_id, offer_code, cost)
  values (me, offer.code, offer.cost)
  returning id into rid;

  insert into public.notifications (profile_id, kind, title, body)
  values (me, 'word', 'Redeemed — ' || offer.name,
          offer.blurb || ' Shoreside will be in touch to arrange it.');

  return rid;
end;
$$;

revoke execute on function public.redeem_knot_offer(text) from public, anon;
grant execute on function public.redeem_knot_offer(text) to authenticated;

-- ===== 4. Contests: regattas and challenges ===================================

-- One engine, two shapes. A regatta ranks its entrants; a challenge measures
-- them against a target. Both are bounded in time and both END — standings are
-- frozen into contest_results at settle and the contest becomes history. There
-- is deliberately no all-time table anywhere in this file.
create table if not exists public.contests (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  shape        text not null check (shape in ('regatta', 'challenge')),
  scope        text not null default 'member' check (scope in ('member', 'crew')),
  title        text not null,
  blurb        text,
  metric       text not null check (metric in ('nm', 'sailings', 'harbors', 'vessels', 'crew_met', 'frames')),
  target       integer,      -- challenges only: the number to reach
  prize        text,
  knots_award  integer not null default 0,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'draft' check (status in ('draft', 'open', 'settled')),
  -- Crew-scoped contests run within one sailing's crew.
  voyage_id    uuid references public.voyages (id) on delete cascade,
  settled_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint contest_window check (ends_at > starts_at),
  constraint challenge_has_target check (shape <> 'challenge' or target is not null),
  constraint crew_scope_has_voyage check (scope <> 'crew' or voyage_id is not null)
);

create table if not exists public.contest_entries (
  contest_id uuid not null references public.contests (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (contest_id, profile_id)
);

create table if not exists public.contest_results (
  contest_id uuid not null references public.contests (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  place      integer,
  score      numeric not null,
  met        boolean not null default false,
  primary key (contest_id, profile_id)
);

create index if not exists contest_entries_profile_idx on public.contest_entries (profile_id);
create index if not exists contests_status_idx on public.contests (status, ends_at desc);

alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;
alter table public.contest_results enable row level security;

drop policy if exists "contests readable" on public.contests;
create policy "contests readable" on public.contests
  for select using (status in ('open', 'settled') or public.is_staff());

drop policy if exists "contests staff writes" on public.contests;
create policy "contests staff writes" on public.contests
  for all using (public.is_staff()) with check (public.is_staff());

-- Entries are visible to everyone in the contest: a regatta with a secret field
-- is not a regatta.
drop policy if exists "entries readable" on public.contest_entries;
create policy "entries readable" on public.contest_entries
  for select using (
    public.is_staff()
    or profile_id = auth.uid()
    or exists (
      select 1 from public.contests c
      where c.id = contest_id and c.status in ('open', 'settled')
    )
  );

drop policy if exists "enter yourself" on public.contest_entries;
create policy "enter yourself" on public.contest_entries
  for insert with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.contests c
      where c.id = contest_id and c.status = 'open' and now() < c.ends_at
    )
  );

drop policy if exists "withdraw yourself" on public.contest_entries;
create policy "withdraw yourself" on public.contest_entries
  for delete using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.contests c
      where c.id = contest_id and c.status = 'open'
    )
  );

drop policy if exists "results readable" on public.contest_results;
create policy "results readable" on public.contest_results
  for select using (
    public.is_staff()
    or exists (select 1 from public.contests c where c.id = contest_id and c.status = 'settled')
  );

-- Live standing for an open contest, frozen results for a settled one. Definer,
-- because scoring reads every entrant's sailings and no member can see those.
create or replace function public.contest_standing(p_contest_id uuid)
returns table (
  profile_id uuid,
  full_name  text,
  handle     text,
  score      numeric,
  place      integer,
  met        boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  c public.contests;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;

  select * into c from public.contests where id = p_contest_id;
  if not found then raise exception 'no such contest'; end if;
  if c.status = 'draft' and not public.is_staff() then raise exception 'not open'; end if;

  if c.status = 'settled' then
    return query
      select r.profile_id, p.full_name, p.handle, r.score, r.place, r.met
      from public.contest_results r
      join public.profiles p on p.id = r.profile_id
      where r.contest_id = c.id
      order by r.place nulls last, r.score desc;
    return;
  end if;

  return query
  with entrant as (
    select e.profile_id from public.contest_entries e where e.contest_id = c.id
  ),
  sail as (
    select r.profile_id, v.id as voyage_id, v.harbor_id, v.distance_nm, r.vessel_id
    from public.rsvps r
    join public.voyages v on v.id = r.voyage_id
    where r.status = 'aboard'
      and v.status = 'completed'
      and v.starts_at >= c.starts_at
      and v.starts_at < c.ends_at
      and (c.voyage_id is null or v.id = c.voyage_id)
      and r.profile_id in (select e.profile_id from entrant e)
  ),
  scored as (
    select
      en.profile_id,
      case c.metric
        when 'nm'       then (select coalesce(sum(s.distance_nm), 0) from sail s where s.profile_id = en.profile_id)
        when 'sailings' then (select count(*) from sail s where s.profile_id = en.profile_id)
        when 'harbors'  then (select count(distinct s.harbor_id) from sail s
                               where s.profile_id = en.profile_id and s.harbor_id is not null)
        when 'vessels'  then (select count(distinct s.vessel_id) from sail s
                               where s.profile_id = en.profile_id and s.vessel_id is not null)
        when 'crew_met' then (select count(distinct r2.profile_id) from public.rsvps r2
                               where r2.voyage_id in (select s.voyage_id from sail s where s.profile_id = en.profile_id)
                                 and r2.status = 'aboard'
                                 and r2.profile_id <> en.profile_id)
        when 'frames'   then (select count(*) from public.voyage_media m
                               where m.uploaded_by = en.profile_id
                                 and m.approved
                                 and m.created_at >= c.starts_at
                                 and m.created_at < c.ends_at)
        else 0
      end::numeric as score
    from entrant en
  )
  select
    sc.profile_id,
    p.full_name,
    p.handle,
    sc.score,
    -- A challenge has no places; everyone who reaches the target has won it.
    case when c.shape = 'regatta'
      then rank() over (order by sc.score desc)::integer
      else null
    end as place,
    case when c.target is null then false else sc.score >= c.target end as met
  from scored sc
  join public.profiles p on p.id = sc.profile_id
  order by sc.score desc, p.full_name;
end;
$$;

revoke execute on function public.contest_standing(uuid) from public, anon;
grant execute on function public.contest_standing(uuid) to authenticated;

-- Settle: freeze the standing, pay out, tell everyone, close the book.
create or replace function public.settle_contest(p_contest_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  c       public.contests;
  n       integer := 0;
  winners integer := 0;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select * into c from public.contests where id = p_contest_id for update;
  if not found then raise exception 'no such contest'; end if;
  if c.status = 'settled' then raise exception 'already settled'; end if;
  if c.status <> 'open' then raise exception 'contest is not open'; end if;

  insert into public.contest_results (contest_id, profile_id, place, score, met)
  select p_contest_id, s.profile_id, s.place, s.score, s.met
  from public.contest_standing(p_contest_id) s
  on conflict (contest_id, profile_id) do update
    set place = excluded.place, score = excluded.score, met = excluded.met;
  get diagnostics n = row_count;

  -- A regatta pays its winner; a challenge pays everyone who reached the target.
  if c.knots_award > 0 then
    insert into public.fathoms_ledger (profile_id, delta, reason)
    select r.profile_id, c.knots_award, 'Won — ' || c.title
    from public.contest_results r
    where r.contest_id = p_contest_id
      and case when c.shape = 'regatta' then r.place = 1 else r.met end;
    get diagnostics winners = row_count;
  end if;

  insert into public.notifications (profile_id, kind, title, body)
  select r.profile_id, 'word',
         c.title || ' — the result.',
         case
           when c.shape = 'regatta' and r.place = 1 then 'You took it. ' || coalesce(c.prize, '')
           when c.shape = 'regatta' then 'You finished ' || r.place::text || '. The standing is final.'
           when r.met then 'You reached it. ' || coalesce(c.prize, '')
           else 'The window has closed. The log stands.'
         end
  from public.contest_results r
  where r.contest_id = p_contest_id;

  update public.contests
  set status = 'settled', settled_at = now()
  where id = p_contest_id;

  return n;
end;
$$;

revoke execute on function public.settle_contest(uuid) from public, anon;
grant execute on function public.settle_contest(uuid) to authenticated;

-- ===== 5. The season's card ===================================================

-- One member's season, for the email that closes it out.
create or replace function public.season_card(
  p_profile_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  sailings    integer,
  nm_logged   numeric,
  harbors     integer,
  crew_met    integer,
  knots_earned integer,
  orders_won  text[],
  longest_nm  numeric,
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
    (select coalesce(array_agg(o.name order by o.position), '{}')
      from public.member_orders mo
      join public.orders o on o.code = mo.order_code
      where mo.profile_id = p_profile_id
        and mo.conferred_at >= p_from and mo.conferred_at < p_to),
    (select max(s.distance_nm) from sail s),
    (select s.title from sail s order by s.distance_nm desc nulls last limit 1);
end;
$$;

revoke execute on function public.season_card(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.season_card(uuid, timestamptz, timestamptz) to authenticated;

-- ===== Backfill ===============================================================

-- Every sailing already completed should have conferred its marks. Do it once,
-- quietly: confer_orders notifies, so members will see the marks they earned
-- before this migration existed.
do $$
declare m uuid;
begin
  for m in
    select distinct r.profile_id
    from public.rsvps r join public.voyages v on v.id = r.voyage_id
    where r.status = 'aboard' and v.status = 'completed'
  loop
    perform public.confer_orders(m);
  end loop;
end;
$$;
