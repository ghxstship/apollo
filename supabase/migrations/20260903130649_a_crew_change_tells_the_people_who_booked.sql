-- If the club bills a crew member on an episode page, a member may book partly
-- because of it. Taking that person off without a word is the small dishonesty
-- that makes billing worthless — and it is the thing studios get right, because
-- an instructor substitution nobody announced is how people stop trusting the
-- schedule.
--
-- FOURTEEN DAYS, not forty-eight hours, which is what I first proposed. Two days
-- out is the window where a member has already made plans, but it is far too
-- late to do anything about it; the useful notice is the one that arrives while
-- they can still change theirs. Beyond a fortnight the rota is still settling
-- and a message about it is noise.
--
-- Only for a crew member who was PUBLIC on the night. A camera operator nobody
-- was told about, released quietly, is not a change any member can perceive —
-- a notice about it would be the club informing people of something it never
-- told them in the first place.
create or replace function public.tell_the_manifest_the_crew_changed()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare ep record; who text; told int := 0;
begin
  /* A confirmation that stopped being one. Anything else — an offer declined,
     a release that was never confirmed — never reached a member's eyes. */
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
         who || ' is off ' || ep.title || '.',
         'The crew changed after you booked. The night runs as planned — we would rather you heard it from us than noticed at the gangway.',
         ep.id
  from public.passes p
  join public.profiles pr on pr.id = p.profile_id
  where p.episode_id = ep.id
    and p.status = 'aboard'
    /* The channel for "something about your night changed" — the same one a
       weather hold uses. A fifth preference key nobody has a control for would
       be a default in disguise. */
    and coalesce((pr.notification_prefs->>'weather')::boolean, true);
  get diagnostics told = row_count;

  return new;
end $$;

drop trigger if exists a_crew_change_reaches_the_manifest on public.crew_assignments;
create trigger a_crew_change_reaches_the_manifest
  after update on public.crew_assignments
  for each row execute function public.tell_the_manifest_the_crew_changed();

-- The invariant this repository enforces, and which caught me last time: a
-- SECURITY DEFINER trigger function must not be callable by hand. This one
-- writes notifications, so a direct call is the club's own alert channel
-- addressed by a stranger.
revoke execute on function public.tell_the_manifest_the_crew_changed() from public, anon, authenticated;;
