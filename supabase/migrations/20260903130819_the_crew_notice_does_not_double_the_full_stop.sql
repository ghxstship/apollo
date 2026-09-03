-- "E2E Sub Test is off Season II regatta, day one.." — episode titles in this
-- club carry their own full stop as a house style ("Anchor: the launch."), and
-- the notice appended a second one. Trimmed then re-added, so a title without
-- one still ends in a sentence.
create or replace function public.tell_the_manifest_the_crew_changed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ep record; who text;
begin
  if old.status <> 'confirmed' or new.status in ('confirmed', 'offered') then
    return new;
  end if;

  select e.id, e.title, e.starts_at into ep
  from public.episodes e
  where e.id = new.episode_id
    and e.starts_at between now() and now() + interval '14 days';
  if not found then return new; end if;

  select c.display_name into who
  from public.crew c where c.id = new.crew_id and c.public and c.active;
  if who is null then return new; end if;

  insert into public.notifications (profile_id, kind, title, body, episode_id)
  select pr.id, 'manifest',
         who || ' is off ' || rtrim(ep.title, '.') || '.',
         'The crew changed after you booked. The night runs as planned — we would rather you heard it from us than noticed at the gangway.',
         ep.id
  from public.passes p
  join public.profiles pr on pr.id = p.profile_id
  where p.episode_id = ep.id
    and p.status = 'aboard'
    and coalesce((pr.notification_prefs->>'weather')::boolean, true);

  return new;
end $$;

revoke execute on function public.tell_the_manifest_the_crew_changed() from public, anon, authenticated;;
