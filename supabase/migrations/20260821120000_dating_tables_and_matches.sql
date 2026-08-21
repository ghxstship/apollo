-- Syrius Dating: tables, not swiping.
--
-- The format, from the kit: Thursday blind tables for six. A seat is claimed
-- and held for fifteen minutes, then confirmed or released. Matches come from
-- tables — after the night, each guest privately names who they'd meet again,
-- and only a mutual pick becomes a match. There is no browsing, no swiping,
-- and no way to pick somebody you didn't share a table with.
--
-- A Table NIGHT is an existing shore-class voyage (FAMILY_LABEL already reads
-- "Table"); the tables here are the seatings within it. Messaging reuses the
-- direct-thread system — a match is an introduction, not a new inbox.

create table if not exists public.dating_tables (
  id        uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages (id) on delete cascade,
  number    integer not null,
  seats     integer not null default 6 check (seats between 2 and 12),
  unique (voyage_id, number)
);

create table if not exists public.table_seats (
  table_id   uuid not null references public.dating_tables (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  state      text not null default 'held' check (state in ('held', 'confirmed')),
  held_until timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now(),
  primary key (table_id, profile_id)
);

create table if not exists public.table_picks (
  table_id  uuid not null references public.dating_tables (id) on delete cascade,
  picker    uuid not null references public.profiles (id) on delete cascade,
  picked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (table_id, picker, picked),
  constraint no_self_pick check (picker <> picked)
);

create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  table_id   uuid not null references public.dating_tables (id) on delete cascade,
  profile_a  uuid not null references public.profiles (id) on delete cascade,
  profile_b  uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint ordered_pair check (profile_a < profile_b),
  unique (profile_a, profile_b)
);

alter table public.dating_tables enable row level security;
alter table public.table_seats enable row level security;
alter table public.table_picks enable row level security;
alter table public.matches enable row level security;

create policy "tables are visible to the cast" on public.dating_tables
  for select to authenticated using (true);
create policy "staff keep tables" on public.dating_tables
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

/* Who sits where is visible once you hold a seat at the same table — a blind
   table stays blind from the outside. Staff see the room. */
create policy "seatmates and staff see the table" on public.table_seats
  for select to authenticated using (
    public.is_staff()
    or profile_id = auth.uid()
    or exists (select 1 from public.table_seats mine
               where mine.table_id = table_seats.table_id and mine.profile_id = auth.uid())
  );

/* Claims go through the RPC (hold windows and capacity race there); a member
   may release their own seat directly. */
create policy "release your own seat" on public.table_seats
  for delete to authenticated using (profile_id = auth.uid());

/* A pick is yours alone — not even your seatmates can read it. That is the
   entire mechanism: only mutuality surfaces anything. */
create policy "your own picks" on public.table_picks
  for select to authenticated using (picker = auth.uid());
create policy "pick from your own chair" on public.table_picks
  for insert to authenticated with check (
    picker = auth.uid()
    and exists (select 1 from public.table_seats s
                where s.table_id = table_picks.table_id
                  and s.profile_id = auth.uid() and s.state = 'confirmed')
    and exists (select 1 from public.table_seats s
                where s.table_id = table_picks.table_id
                  and s.profile_id = table_picks.picked and s.state = 'confirmed')
    and exists (select 1 from public.dating_tables t
                join public.voyages v on v.id = t.voyage_id
                where t.id = table_picks.table_id and v.starts_at < now())
  );

create policy "your matches are yours" on public.matches
  for select to authenticated using (
    profile_a = auth.uid() or profile_b = auth.uid() or public.is_staff()
  );

revoke insert, update, delete on public.dating_tables from anon;
revoke insert, update, delete on public.table_seats from anon;
revoke insert, update, delete on public.table_picks from anon;
revoke insert, update, delete on public.matches from anon;

-- ===== The seat-hold RPC: fifteen minutes, honestly raced ====================
create or replace function public.claim_table_seat(p_table uuid)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
  cap integer;
  taken integer;
  until_ts timestamptz;
begin
  if me is null then raise exception 'sign in required'; end if;

  -- One table per night: holding a second seat drops the first.
  perform pg_advisory_xact_lock(hashtext('table_seat:' || me::text));

  select seats into cap from public.dating_tables where id = p_table;
  if cap is null then raise exception 'no such table'; end if;

  -- Expired holds are vacated on the way in.
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

revoke execute on function public.claim_table_seat(uuid) from public, anon;
grant execute on function public.claim_table_seat(uuid) to authenticated;

create or replace function public.confirm_table_seat(p_table uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in required'; end if;
  update public.table_seats
  set state = 'confirmed'
  where table_id = p_table and profile_id = me
    and (state = 'confirmed' or held_until >= now());
  if not found then
    raise exception 'the hold lapsed — claim the seat again';
  end if;
end;
$$;

revoke execute on function public.confirm_table_seat(uuid) from public, anon;
grant execute on function public.confirm_table_seat(uuid) to authenticated;

-- ===== Mutuality makes the match =============================================
create or replace function public.match_on_mutual_pick()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  a uuid; b uuid;
begin
  if exists (
    select 1 from public.table_picks p
    where p.table_id = new.table_id and p.picker = new.picked and p.picked = new.picker
  ) then
    a := least(new.picker, new.picked);
    b := greatest(new.picker, new.picked);
    insert into public.matches (table_id, profile_a, profile_b)
    values (new.table_id, a, b)
    on conflict (profile_a, profile_b) do nothing;

    insert into public.notifications (profile_id, kind, title, body)
    select x.pid, 'word', 'A match, from your table',
           'You both said Thursday. The introduction is in your matches — say something.'
    from (values (a), (b)) as x(pid);
  end if;
  return new;
end;
$$;

drop trigger if exists on_table_pick on public.table_picks;
create trigger on_table_pick
after insert on public.table_picks
for each row execute function public.match_on_mutual_pick();
revoke execute on function public.match_on_mutual_pick() from public, anon, authenticated;

-- ===== Tables for the seeded Table nights ====================================
insert into public.dating_tables (voyage_id, number, seats)
select v.id, n, 6
from public.voyages v
cross join generate_series(1, 3) as n
where v.class = 'shore' and v.status = 'scheduled'
on conflict (voyage_id, number) do nothing;
