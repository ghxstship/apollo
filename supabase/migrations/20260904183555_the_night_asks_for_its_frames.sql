-- Galleries are the strongest retention artifact and the pipeline exists —
-- upload during Live, an approval queue, consent per member. Only the ask
-- was missing. After a night wraps, everyone who was aboard, checked in and
-- in frame gets one letter asking for what they shot.
create or replace function public.the_night_asks_for_its_frames()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.email_outbox (to_email, template, payload)
    select p.email, 'frames-wanted',
           jsonb_build_object('name', p.full_name, 'voyage', new.title, 'episode', new.title, 'slug', new.slug)
      from public.passes r
      join public.profiles p on p.id = r.profile_id
     where r.episode_id = new.id and r.status = 'aboard' and r.checked_in_at is not null
       and coalesce(p.on_camera, false) and p.camera_withdrawn_at is null
       and p.email is not null;
  end if;
  return new;
end $function$;
revoke all on function public.the_night_asks_for_its_frames() from public, anon, authenticated;
drop trigger if exists the_night_asks_for_its_frames on public.episodes;
create trigger the_night_asks_for_its_frames
  after update of status on public.episodes
  for each row execute function public.the_night_asks_for_its_frames();;
