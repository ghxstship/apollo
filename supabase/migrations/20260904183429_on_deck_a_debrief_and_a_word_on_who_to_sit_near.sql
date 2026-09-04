-- Three small things the night owes its members afterwards and during.
--
-- On deck: the gangway already knows who arrived. A member who consented to
-- the manifest can be seen as aboard now, with a one-line status they set
-- themselves and that expires with the night. Soho House's most-loved
-- feature, and here it costs nothing.
alter table public.profiles
  add column if not exists deck_status text check (deck_status is null or length(deck_status) <= 80),
  add column if not exists deck_status_until timestamptz;

create or replace function public.aboard_now(p_episode uuid)
returns table (profile_id uuid, name text, avatar_tone text, status text, checked_in_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, p.full_name, p.avatar_tone,
         case when p.deck_status_until > now() then p.deck_status end,
         r.checked_in_at
    from public.passes r
    join public.profiles p on p.id = r.profile_id
    join public.episodes e on e.id = r.episode_id
   where r.episode_id = p_episode
     and r.status = 'aboard'
     and r.checked_in_at is not null
     and coalesce(r.show_on_manifest, true)
     and p.status = 'active'
     and e.status = 'live'
     and (public.is_staff() or exists (
           select 1 from public.passes mine
            where mine.episode_id = p_episode and mine.profile_id = auth.uid() and mine.status = 'aboard'))
   order by r.checked_in_at desc;
$function$;
revoke all on function public.aboard_now(uuid) from public, anon;
grant execute on function public.aboard_now(uuid) to authenticated;

-- The debrief: one question to Shoreside, never a score, never public.
create table if not exists public.debriefs (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references public.episodes(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  note        text check (note is null or length(note) <= 2000),
  again       boolean,
  created_at  timestamptz not null default now(),
  unique (episode_id, profile_id)
);
alter table public.debriefs enable row level security;
create policy "a member writes their own debrief" on public.debriefs
  for insert to authenticated with check (profile_id = auth.uid()
    and exists (select 1 from public.passes r where r.episode_id = debriefs.episode_id and r.profile_id = auth.uid() and r.status = 'aboard'));
create policy "a member reads their own debrief" on public.debriefs
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
grant select, insert on public.debriefs to authenticated;

create or replace function public.a_night_asks_one_question()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.notifications (profile_id, kind, title, body, episode_id, href)
    select r.profile_id, 'word', 'Anything the Bridge should know?',
           'One question about ' || rtrim(new.title, '.') || '. It goes to Shoreside and nowhere else.',
           new.id, '/debrief/' || new.slug
      from public.passes r
     where r.episode_id = new.id and r.status = 'aboard' and r.checked_in_at is not null;
  end if;
  return new;
end $function$;
revoke all on function public.a_night_asks_one_question() from public, anon, authenticated;
drop trigger if exists a_night_asks_one_question on public.episodes;
create trigger a_night_asks_one_question
  after update of status on public.episodes
  for each row execute function public.a_night_asks_one_question();

-- Sit near again: a pick that need not be mutual, read by the person laying
-- the next Table night.
alter table public.table_picks add column if not exists again boolean not null default false;
comment on column public.table_picks.again is 'Sit near this person again. Not a match; a hint to the Bridge for the next seating.';;
