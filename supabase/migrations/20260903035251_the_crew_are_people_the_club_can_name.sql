-- Nothing in this schema named who works an episode. episodes has no host, no
-- captain, no crew column; crew_requests is members volunteering, and the
-- variable called `crew` on the episode page holds members aboard.
--
-- Which matters more here than it would in a studio. The crew are on camera —
-- that is the premise of the show — so who is working is not an operational
-- detail, it is billing. This table is the people; the rota that follows is the
-- boring half that makes the billing possible.

create table if not exists public.crew (
  id uuid primary key default gen_random_uuid(),
  /* NULLABLE, and that is the important part: a contracted deckhand may never
     hold a membership, and a rota that can only schedule people with accounts
     is a rota that gets kept in a spreadsheet instead. */
  profile_id uuid references public.profiles(id) on delete set null,
  slug text not null,
  display_name text not null,
  /* How they are billed — Deckhand, Chief Stew, Skipper. Not the same as the
     position they are assigned to on a given night, which is crew_positions:
     a Chief Stew can work a gangway. */
  role_title text not null,
  city text,
  bio text,
  avatar_tone text not null default 'ink',
  /* OPT-IN, DEFAULTING OFF. Being scheduled is a job; being shown to members
     with your face and your name is a different thing to agree to, and a
     contractor has not agreed to be a character. Nothing renders publicly until
     someone sets this true, deliberately, per person. */
  public boolean not null default false,
  active boolean not null default true,
  since date,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

/* /crew/wanted is the hiring list and it is a static segment, so it wins the
   route against /crew/[slug] — but a crew member slugged "wanted" would still
   be unreachable, and unreachable-by-collision is the kind of bug that gets
   found by the person it happens to. */
alter table public.crew drop constraint if exists crew_slug_is_not_a_route;
alter table public.crew add constraint crew_slug_is_not_a_route
  check (slug not in ('wanted', 'new'));
create unique index if not exists crew_slug_key on public.crew (slug);
create index if not exists crew_public_active on public.crew (public, active);

/* The jobs a night needs doing, which is not the same list as the titles people
   hold. Setting decides which of them a given episode wants at all. */
create table if not exists public.crew_positions (
  slug text primary key,
  label text not null,
  /* 'sea', 'shore', or null for both. */
  setting text check (setting in ('sea', 'shore')),
  position integer not null default 0
);

insert into public.crew_positions (slug, label, setting, position) values
  ('skipper',    'Skipper',    'sea',   1),
  ('deckhand',   'Deckhand',   'sea',   2),
  ('host',       'Host',       'shore', 3),
  ('shore_lead', 'Shore lead', 'shore', 4),
  ('gangway',    'Gangway',    null,    5),
  ('camera',     'Camera',     null,    6)
on conflict (slug) do nothing;

alter table public.crew enable row level security;
alter table public.crew_positions enable row level security;

/* Public reads only the people who opted in and are still working. */
drop policy if exists "a public crew member is public" on public.crew;
create policy "a public crew member is public" on public.crew
  for select to anon, authenticated using (public and active);

drop policy if exists "staff read every crew member" on public.crew;
create policy "staff read every crew member" on public.crew
  for select to authenticated using (public.is_staff());

drop policy if exists "staff keep the crew list" on public.crew;
create policy "staff keep the crew list" on public.crew
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "positions are public" on public.crew_positions;
create policy "positions are public" on public.crew_positions
  for select to anon, authenticated using (true);

drop policy if exists "staff keep the positions" on public.crew_positions;
create policy "staff keep the positions" on public.crew_positions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select on public.crew to anon, authenticated;
grant insert, update, delete on public.crew to authenticated;
grant select on public.crew_positions to anon, authenticated;
grant insert, update, delete on public.crew_positions to authenticated;;
