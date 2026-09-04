-- Three rules in the booking guard, by surgery on the live body.
--
-- Guests: pass_guard still refused guests on any tier but 'global', the same
-- rename residue the guest-row guard carried; it reads the plan's allowance.
--
-- By request: an episode flagged by_request takes no aboard pass from the
-- door. A member asks for a place; the Bridge offers one the night before
-- through the numbered line; the offer is the key that lets the pass in.
--
-- Standby: N passes beyond the hull ceiling, flagged standby, that do not
-- count against capacity and board only if a seat has come free by muster —
-- at which moment the pass stops being standby and takes the seat.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'pass_guard' and p.pronamespace = 'public'::regnamespace;

  if src not like '%  if coalesce(new.guests, 0) > 0 and member.tier <> ''global'' then
    raise exception ''guest passes ride on Global memberships'';
  end if;
  if coalesce(new.guests, 0) > 2 then
    raise exception ''two guest passes per member'';
  end if;%' then raise exception 'pass_guard: guest anchor missing'; end if;
  src := replace(src, '  if coalesce(new.guests, 0) > 0 and member.tier <> ''global'' then
    raise exception ''guest passes ride on Global memberships'';
  end if;
  if coalesce(new.guests, 0) > 2 then
    raise exception ''two guest passes per member'';
  end if;',
'  if coalesce(new.guests, 0) > 0 then
    if coalesce((select m.guest_allowance from public.membership_plans m where m.id = member.plan_id), 0) <= 0 then
      raise exception ''guest passes ride on paid memberships — Deck and above'';
    end if;
    if coalesce(new.guests, 0) > (select m.guest_allowance from public.membership_plans m where m.id = member.plan_id) then
      raise exception ''% guest passes per pass on your plan'', (select m.guest_allowance from public.membership_plans m where m.id = member.plan_id);
    end if;
  end if;');

  if src not like '%  -- Capacity net of operator holds
  if public.passes_left(new.episode_id, new.id) < public.segment_heads(new.segment) + coalesce(new.guests, 0) then
    raise exception ''the manifest is full — join the waitlist'';
  end if;%' then raise exception 'pass_guard: capacity anchor missing'; end if;
  src := replace(src, '  -- Capacity net of operator holds
  if public.passes_left(new.episode_id, new.id) < public.segment_heads(new.segment) + coalesce(new.guests, 0) then
    raise exception ''the manifest is full — join the waitlist'';
  end if;',
'  -- By request: the Bridge decides, and its offer is the key.
  if coalesce(v.by_request, false) and not exists (
       select 1 from public.waitlist_entries w
        where w.episode_id = new.episode_id and w.profile_id = new.profile_id
          and w.offered_at is not null and w.released_at is null
          and (w.claimed_at is not null or w.claim_expires_at > now())) then
    raise exception ''this one is by request — ask for a place and the Bridge writes back'';
  end if;
  -- Capacity net of operator holds. A standby pass stands outside the count
  -- and boards only if a seat has come free by muster.
  if coalesce(new.standby, false) then
    if (select count(*) from public.passes s where s.episode_id = new.episode_id and s.standby and s.status = ''aboard'' and s.id <> new.id)
       >= coalesce(v.standby_passes, 0) then
      raise exception ''standby is full for this episode'';
    end if;
  elsif public.passes_left(new.episode_id, new.id) < public.segment_heads(new.segment) + coalesce(new.guests, 0) then
    if coalesce(v.standby_passes, 0) > 0 then
      raise exception ''the manifest is full — join the waitlist, or take a standby pass and board if a seat comes free'';
    end if;
    raise exception ''the manifest is full — join the waitlist'';
  end if;');
  execute src;
end $$;

-- A standby pass is not a seat until it boards.
create or replace function public.passes_left(p_voyage uuid, p_except_rsvp uuid default null)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select v.passes_total - v.held_passes
       - coalesce((select sum(public.segment_heads(r.segment) + coalesce(r.guests, 0))
                   from public.passes r
                   where r.episode_id = v.id and r.status = 'aboard'
                     and not coalesce(r.standby, false)
                     and (p_except_rsvp is null or r.id <> p_except_rsvp)), 0)
  from public.episodes v where v.id = p_voyage
$function$;
revoke execute on function public.passes_left(uuid, uuid) from public;
grant execute on function public.passes_left(uuid, uuid) to anon, authenticated;

-- At the gangway a standby pass boards only into a free seat, and becomes one.
create or replace function public.guard_the_gangway_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.standby, false) and new.checked_in_at is not null and old.checked_in_at is null then
    if public.passes_left(new.episode_id, new.id) < public.segment_heads(new.segment) + coalesce(new.guests, 0) then
      raise exception 'no seat has come free for this standby pass';
    end if;
    new.standby := false;
  end if;
  if auth.uid() is null or public.is_staff() then return new; end if;
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('app.accepting_pass', true), 'off') = 'on' then return new; end if;
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
end $function$;
drop trigger if exists guard_the_gangway_columns on public.passes;
create trigger guard_the_gangway_columns
  before update of checked_in_at, checked_in_by, boarding_code, vessel_id, segment, standby on public.passes
  for each row execute function public.guard_the_gangway_columns();;
