-- is_staff was one boolean, so everyone who could scan a pass could also open
-- the Bridge. Hired crew are arriving through the rota. A door grant is
-- scoped to one episode and expires; it lets its holder read the manifest and
-- stamp arrivals, and nothing else.
create table if not exists public.door_grants (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  episode_id  uuid not null references public.episodes(id) on delete cascade,
  granted_by  uuid references public.profiles(id) on delete set null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  unique (profile_id, episode_id)
);
alter table public.door_grants enable row level security;
create policy "staff keep the door grants" on public.door_grants
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "a door reads their own grant" on public.door_grants
  for select to authenticated using (profile_id = auth.uid());
grant select, insert, update, delete on public.door_grants to authenticated;
create index if not exists door_grants_live on public.door_grants (profile_id, expires_at);

create or replace function public.is_door(p_episode uuid default null)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_staff() or exists (
    select 1 from public.door_grants g
     where g.profile_id = auth.uid()
       and g.expires_at > now()
       and (p_episode is null or g.episode_id = p_episode)
  );
$function$;
revoke all on function public.is_door(uuid) from public, anon;
grant execute on function public.is_door(uuid) to authenticated;

-- The door reads the manifest of its episode and stamps arrivals; the gangway
-- columns guard lets it through.
create policy "the door reads its manifest" on public.passes
  for select to authenticated using (public.is_door(episode_id));
create policy "the door stamps arrivals" on public.passes
  for update to authenticated using (public.is_door(episode_id)) with check (public.is_door(episode_id));
create policy "the door reads its guests" on public.pass_guests
  for select to authenticated using (exists (select 1 from public.passes r where r.id = pass_guests.rsvp_id and public.is_door(r.episode_id)));
create policy "the door stamps guests" on public.pass_guests
  for update to authenticated using (exists (select 1 from public.passes r where r.id = pass_guests.rsvp_id and public.is_door(r.episode_id)))
  with check (exists (select 1 from public.passes r where r.id = pass_guests.rsvp_id and public.is_door(r.episode_id)));

create or replace function public.guard_the_gangway_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_staff() then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('app.accepting_pass', true), 'off') = 'on' then return new; end if;
  /* A door grant may stamp arrivals on its episode and nothing else. */
  if public.is_door(new.episode_id)
     and new.boarding_code is not distinct from old.boarding_code
     and new.vessel_id is not distinct from old.vessel_id
     and new.segment is not distinct from old.segment then
    return new;
  end if;
  if new.checked_in_at is distinct from old.checked_in_at
     or new.checked_in_by is distinct from old.checked_in_by then
    raise exception 'the gangway checks you in, not the other way round';
  end if;
  if new.boarding_code is distinct from old.boarding_code then
    raise exception 'a boarding code is issued by the club';
  end if;
  if new.vessel_id is distinct from old.vessel_id then
    raise exception 'the Bridge assigns hulls';
  end if;
  if new.segment is distinct from old.segment
     and old.status = 'aboard' and new.status = 'aboard' then
    raise exception 'a pass keeps the segment it was booked in — release it and book again';
  end if;
  return new;
end $function$;;
