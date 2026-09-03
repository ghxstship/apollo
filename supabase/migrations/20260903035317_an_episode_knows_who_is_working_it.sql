-- Offered, not assigned. An assignment nobody acknowledged is not cover — it is
-- a name in a box — and the whole value of a rota is knowing which nights are
-- actually crewed. Confirmed is the only status that counts against a need.

create table if not exists public.crew_assignments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  crew_id uuid not null references public.crew(id) on delete cascade,
  position_slug text not null references public.crew_positions(slug),
  call_time timestamptz,
  status text not null default 'offered'
    check (status in ('offered', 'confirmed', 'declined', 'released')),
  assigned_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  /* One person works one job a night. Two positions on one episode is a
     scheduling mistake nine times out of ten, and the tenth is a conversation
     rather than a row. */
  unique (episode_id, crew_id)
);

create index if not exists crew_assignments_by_episode on public.crew_assignments (episode_id);
create index if not exists crew_assignments_by_crew on public.crew_assignments (crew_id, created_at desc);

-- When somebody cannot work, not when they can. Availability calendars are the
-- thing rota systems drown in: blackouts are a fraction of the data and answer
-- nearly all of the question.
create table if not exists public.crew_blackouts (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crew(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  note text,
  created_at timestamptz not null default now(),
  check (to_date >= from_date)
);
create index if not exists crew_blackouts_by_crew on public.crew_blackouts (crew_id, from_date);

-- How many of each position a night wants, by setting, with a per-episode
-- override for the ones that are not typical.
create table if not exists public.crew_needs (
  setting text not null check (setting in ('sea', 'shore')),
  position_slug text not null references public.crew_positions(slug),
  headcount integer not null check (headcount > 0),
  primary key (setting, position_slug)
);

insert into public.crew_needs (setting, position_slug, headcount) values
  ('sea',   'skipper',    1),
  ('sea',   'deckhand',   2),
  ('sea',   'gangway',    1),
  ('sea',   'camera',     1),
  ('shore', 'host',       1),
  ('shore', 'shore_lead', 1),
  ('shore', 'gangway',    1),
  ('shore', 'camera',     1)
on conflict do nothing;

create table if not exists public.episode_crew_needs (
  episode_id uuid not null references public.episodes(id) on delete cascade,
  position_slug text not null references public.crew_positions(slug),
  /* Zero is meaningful and is why this is >= rather than > : it is how an
     episode says it does not want a position its setting normally has. */
  headcount integer not null check (headcount >= 0),
  primary key (episode_id, position_slug)
);

alter table public.crew_assignments enable row level security;
alter table public.crew_blackouts enable row level security;
alter table public.crew_needs enable row level security;
alter table public.episode_crew_needs enable row level security;

/* A confirmed billing for someone who opted in is public — that is the whole
   guest-facing point. Everything else about the rota is not: an offer nobody
   accepted, a decline, a release are the club's business and reading them would
   tell a member who turned the night down. */
drop policy if exists "a confirmed billing is public" on public.crew_assignments;
create policy "a confirmed billing is public" on public.crew_assignments
  for select to anon, authenticated using (
    status = 'confirmed'
    and exists (select 1 from public.crew c
                where c.id = crew_assignments.crew_id and c.public and c.active)
  );

drop policy if exists "staff read the rota" on public.crew_assignments;
create policy "staff read the rota" on public.crew_assignments
  for select to authenticated using (public.is_staff());

drop policy if exists "staff keep the rota" on public.crew_assignments;
create policy "staff keep the rota" on public.crew_assignments
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

/* Blackouts are private. Why somebody cannot work a Tuesday is nobody's
   business but the person scheduling them. */
drop policy if exists "staff keep the blackouts" on public.crew_blackouts;
create policy "staff keep the blackouts" on public.crew_blackouts
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff keep the needs" on public.crew_needs;
create policy "staff keep the needs" on public.crew_needs
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "staff keep the episode needs" on public.episode_crew_needs;
create policy "staff keep the episode needs" on public.episode_crew_needs
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select on public.crew_assignments to anon, authenticated;
grant insert, update, delete on public.crew_assignments to authenticated;
grant select, insert, update, delete on public.crew_blackouts to authenticated;
grant select, insert, update, delete on public.crew_needs to authenticated;
grant select, insert, update, delete on public.episode_crew_needs to authenticated;;
