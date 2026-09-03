-- "the vetting file is not open yet — identity comes first" is true and tells a
-- member nothing they can act on. It does not say who opens the file, whether
-- they are the hold-up, or where the page is that answers either question.
--
-- The Vetting page now says whose move each gate is, so the refusal can send
-- them to it. Every other line here is left exactly as written: the declined
-- and pending clearances deliberately share one sentence, because the refusal
-- lands at a checkout where a member may be reading over somebody's shoulder,
-- and "declined" is not a thing to publish to a room.
create or replace function public.guard_the_vetting()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  f record;
begin
  if new.status <> 'aboard' then return new; end if;
  if not exists (
    select 1 from public.episode_segment_caps c where c.episode_id = new.episode_id
  ) and not exists (
    select 1 from public.episodes v
    where v.id = new.episode_id and v.series is not null and public.a_pass_is_required(v.series)
  ) then return new; end if;

  -- Already aboard this sailing: the seat is held, and this gate guards the
  -- door rather than the room.
  if tg_op = 'UPDATE' and old.status = 'aboard' and old.episode_id = new.episode_id
     and old.profile_id = new.profile_id then
    return new;
  end if;

  select * into f from public.vetting_files where profile_id = new.profile_id;

  if f.id is null or f.id_verified_at is null then
    raise exception 'your vetting file is not open yet — the Vetting page shows what is yours to finish and what is with us';
  end if;
  if not f.age_ok then
    raise exception 'this episode seats 25 to 45, with no exceptions';
  end if;
  if f.background_state = 'needs_a_call' then
    raise exception 'a ten-minute video call finishes your clearance';
  end if;
  if f.background_state <> 'cleared' then
    -- Says nothing about why. A declined file and a pending one get the same
    -- sentence on purpose: the refusal is at a checkout, where a member may be
    -- reading it over someone's shoulder, and "declined" is not a thing to
    -- publish to a room.
    raise exception 'your clearance is not in — the vetting team writes when it is';
  end if;
  if not public.is_staff() and not exists (
    select 1 from public.preference_sheets s
    where s.profile_id = new.profile_id and s.completed_at is not null
  ) then
    raise exception 'the Preference Sheet finishes your file — three parts, five minutes, on the vetting page';
  end if;
  if f.cleared_until is not null and f.cleared_until <= now() then
    raise exception 'your clearance lapsed on % — the vetting team reopens it',
      to_char(f.cleared_until at time zone public.club_zone(), 'Mon DD');
  end if;

  return new;
end $$;

revoke execute on function public.guard_the_vetting() from public, anon, authenticated;;
