-- ===== Tier 1: directory, messaging, media =====

alter table public.profiles
  add column bio text,
  add column in_directory boolean not null default true,
  add column interests text[] not null default '{}',
  add column calendar_token uuid not null default gen_random_uuid(),
  add column phone text,
  add column phone_verified boolean not null default false;

-- Who has shared water with whom — powers "sailed together" in the directory.
create view public.member_affinity with (security_invoker = on) as
select a.profile_id as profile_id, b.profile_id as other_id, count(*)::int as shared
from public.rsvps a
join public.rsvps b on b.voyage_id = a.voyage_id and b.profile_id <> a.profile_id
where a.status = 'aboard' and b.status = 'aboard'
group by a.profile_id, b.profile_id;

-- ===== Messaging: crew threads (per voyage) and direct threads =====
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crew','direct','shoreside')),
  voyage_id uuid references public.voyages(id) on delete cascade,
  title text,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index threads_one_crew_per_voyage on public.threads (voyage_id) where kind = 'crew';

create table public.thread_members (
  thread_id uuid not null references public.threads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);
create index on public.thread_members (profile_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.messages (thread_id, created_at desc);

-- Membership decides visibility; a definer helper avoids RLS recursion.
create or replace function public.in_thread(p_thread uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.thread_members tm
    where tm.thread_id = p_thread and tm.profile_id = auth.uid()
  );
$$;
revoke execute on function public.in_thread(uuid) from public, anon;
grant execute on function public.in_thread(uuid) to authenticated;

alter table public.threads enable row level security;
alter table public.thread_members enable row level security;
alter table public.messages enable row level security;

create policy "read own threads" on public.threads
  for select to authenticated using (public.in_thread(id) or public.is_staff());
create policy "staff write threads" on public.threads
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "read thread roster" on public.thread_members
  for select to authenticated using (public.in_thread(thread_id) or public.is_staff());
create policy "manage own membership" on public.thread_members
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy "read thread messages" on public.messages
  for select to authenticated using (public.in_thread(thread_id) or public.is_staff());
create policy "write to own threads" on public.messages
  for insert to authenticated
  with check (author_id = auth.uid() and public.in_thread(thread_id)
              and not exists (select 1 from public.threads t where t.id = thread_id and t.closed_at is not null));
create policy "delete own message" on public.messages
  for delete to authenticated using (author_id = auth.uid() or public.is_staff());

-- Open a direct thread with another member (idempotent, two people).
create or replace function public.open_direct_thread(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_other = auth.uid() then raise exception 'that is you'; end if;
  select tm.thread_id into t
  from public.thread_members tm
  join public.threads th on th.id = tm.thread_id and th.kind = 'direct'
  where tm.profile_id = auth.uid()
    and exists (select 1 from public.thread_members o where o.thread_id = tm.thread_id and o.profile_id = p_other)
  limit 1;
  if t is not null then return t; end if;
  insert into public.threads (kind) values ('direct') returning id into t;
  insert into public.thread_members (thread_id, profile_id) values (t, auth.uid()), (t, p_other);
  return t;
end $$;
grant execute on function public.open_direct_thread(uuid) to authenticated;

-- Crew threads open when a pass is confirmed and close after the debrief.
create or replace function public.join_crew_thread()
returns trigger language plpgsql security definer set search_path = public as $$
declare t uuid; v record;
begin
  if new.status <> 'aboard' then return new; end if;
  select * into v from public.voyages where id = new.voyage_id;
  select id into t from public.threads where voyage_id = new.voyage_id and kind = 'crew';
  if t is null then
    insert into public.threads (kind, voyage_id, title) values ('crew', new.voyage_id, v.title)
    on conflict (voyage_id) where kind = 'crew' do nothing
    returning id into t;
    if t is null then select id into t from public.threads where voyage_id = new.voyage_id and kind = 'crew'; end if;
  end if;
  insert into public.thread_members (thread_id, profile_id) values (t, new.profile_id)
  on conflict do nothing;
  return new;
end $$;
create trigger on_rsvp_join_crew
after insert or update of status on public.rsvps
for each row execute function public.join_crew_thread();
revoke execute on function public.join_crew_thread() from public, anon, authenticated;

-- ===== Voyage media (post-event galleries) =====
create table public.voyage_media (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.voyage_media (voyage_id);
alter table public.voyage_media enable row level security;
create policy "members read approved media" on public.voyage_media
  for select to authenticated using (approved or uploaded_by = auth.uid() or public.is_staff());
create policy "aboard members upload" on public.voyage_media
  for insert to authenticated
  with check (uploaded_by = auth.uid() and exists (
    select 1 from public.rsvps r where r.voyage_id = voyage_media.voyage_id
      and r.profile_id = auth.uid() and r.status = 'aboard'));
create policy "staff curate media" on public.voyage_media
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ===== Crew forming: "sailing solo?" =====
create table public.crew_requests (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  open boolean not null default true,
  created_at timestamptz not null default now(),
  unique (voyage_id, profile_id)
);
alter table public.crew_requests enable row level security;
create policy "members read crew requests" on public.crew_requests
  for select to authenticated using (true);
create policy "manage own crew request" on public.crew_requests
  for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
