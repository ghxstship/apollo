-- Two faults in one path.
--
-- FIRST: the owner struck the weather-hold metaphor for membership standing.
-- 20260825020556 rewrote every function whose body matched '%membership is on
-- hold%'. handle_profile_status contains neither that phrase nor 'weather', so
-- the match missed it and it kept sending members "Weather hold on your
-- membership." A weather hold is a real thing here — a SAILING held for
-- conditions, called by 18:00 the night before — which is exactly why borrowing
-- it for a billing state was wrong.
--
-- SECOND, and worse: a member the club paused could not leave. set_own_standing
-- checks the club-hold before it looks at p_status, so 'departed' was refused
-- along with 'active' — while dues kept drawing, because the Bridge pause never
-- touched Stripe. A member could be charged indefinitely with no way to stop it
-- except by reaching a human. Resuming is the club's call; leaving never is.
create or replace function public.handle_profile_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'departed' and old.status <> 'departed' then
    insert into public.email_outbox (to_email, template, payload)
    values (new.email, 'farewell', jsonb_build_object('name', new.full_name));
  elsif new.status = 'paused' and old.status <> 'paused' then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.id, 'word', 'Your membership is paused.',
            'Knots and tier keep. Resume with a word.');
  elsif new.status = 'active' and old.status = 'paused' then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.id, 'word', 'Your membership is running again.',
            'The pause is lifted. Booking, posting and contests are open, and dues pick up where they left off.');
  end if;
  return new;
end $function$;

-- Leaving is not something the club gets to refuse.
create or replace function public.set_own_standing(p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_now text; v_by uuid;
begin
  if v_uid is null then raise exception 'sign in first'; end if;
  if p_status not in ('active', 'paused', 'departed') then
    raise exception 'a membership is active, paused or departed';
  end if;

  -- Lock the row before deciding. Reading without FOR UPDATE let a member's
  -- resume and a club pause both pass their guards on stale reads, and the
  -- later write simply won last — reopening the very hold it was refusing.
  select status, status_set_by into v_now, v_by
    from public.profiles where id = v_uid for update;

  if v_now = p_status then return; end if;

  -- A club-placed pause holds against resuming. It does not hold against
  -- leaving: a member who wants out must always be able to get out, or the
  -- club is charging a card that nobody on the member's side can stop.
  if v_now = 'paused' and v_by is distinct from v_uid and p_status <> 'departed' then
    raise exception 'the club paused this membership — a word with Shoreside lifts it';
  end if;

  update public.profiles
     set status = p_status, status_set_by = v_uid
   where id = v_uid;
end $function$;

revoke execute on function public.handle_profile_status() from public, anon, authenticated;

-- The struck wording is sitting in members' inboxes. Nothing was ever
-- delivered — every push_outbox row for it is 'skipped' — but the in-app
-- notice is on screen right now, so correcting the function without correcting
-- what it already wrote would leave the metaphor exactly where members read it.
update public.notifications
   set title = 'Your membership is paused.',
       body  = 'Knots and tier keep. Resume with a word.'
 where title = 'Weather hold on your membership.';

update public.notifications
   set body = replace(body, 'The hold is lifted.', 'The pause is lifted.')
 where body like 'The hold is lifted.%';

update public.push_outbox
   set title = 'Your membership is paused.'
 where title = 'Weather hold on your membership.'
   and status = 'skipped';

do $$
declare n int;
begin
  select count(*) into n from public.notifications
   where title ilike '%weather hold%' and title ilike '%membership%';
  if n > 0 then raise exception 'the membership metaphor is still in % notice(s)', n; end if;

  -- and prove leaving is reachable from a club-placed pause
  if pg_get_functiondef('public.set_own_standing'::regproc) not like '%p_status <> ''departed''%' then
    raise exception 'the club hold still refuses departure';
  end if;
end $$;;
