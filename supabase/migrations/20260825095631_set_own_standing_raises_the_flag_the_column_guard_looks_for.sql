-- I rewrote set_own_standing in 20260825094526 to add FOR UPDATE and to let a
-- club-paused member leave, and in doing so dropped two things the original
-- had for good reason:
--
--   1. `set_config('app.set_standing','on',true)`. guard_privileged_profile_columns
--      refuses any status change by a non-staff caller unless that
--      transaction-local flag is on. Without it EVERY member pause, resume and
--      departure raised "membership standing moves from the Bridge, not from
--      here" — the function could no longer do the only thing it exists for.
--
--   2. It set `status_set_by` itself. The same guard reserves that column for
--      stamp_who_changed_standing, which fills it from auth.uid() when the
--      caller has not — so writing it here was refused as well.
--
-- The previous migration's self-test asked whether the function TEXT contained
-- a substring. It did, so the test passed while the function was broken. A
-- check that reads source instead of behaviour is not a check. The one at the
-- bottom drives all three transitions plus a negative control.
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

  -- The one door the column guard opens for a member. Transaction-local, so it
  -- cannot leak into anything else the request goes on to do.
  perform set_config('app.set_standing', 'on', true);
  -- status_set_by is left alone on purpose: stamp_who_changed_standing fills it
  -- from auth.uid(), and the guard refuses a caller that writes it directly.
  update public.profiles set status = p_status where id = v_uid;
end $function$;

do $$
declare
  v_member uuid; v_staff uuid; got text; was text; was_by uuid;
begin
  select id into v_member from public.profiles where email = 'e2e-regional@syrius.social';
  select id into v_staff  from public.profiles where email = 'e2e-staff@syrius.social';
  if v_member is null or v_staff is null then
    raise notice 'fixtures absent — skipping the behavioural check';
    return;
  end if;
  select status, status_set_by into was, was_by from public.profiles where id = v_member;

  -- SELF-paused: pause then resume. This is the path my last migration broke.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role','authenticated')::text, true);
  perform public.set_own_standing('paused');
  select status into got from public.profiles where id = v_member;
  if got <> 'paused' then raise exception 'a member cannot pause: got %', got; end if;
  perform public.set_own_standing('active');
  select status into got from public.profiles where id = v_member;
  if got <> 'active' then raise exception 'a member cannot resume: got %', got; end if;

  -- CLUB-paused: staff place it, as staff, so the budget guard sees a signer.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  update public.profiles set status = 'paused', status_set_by = v_staff where id = v_member;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role','authenticated')::text, true);
  begin
    perform public.set_own_standing('active');
    raise exception 'a club-placed pause no longer holds against resuming';
  exception when others then
    if sqlerrm not like '%a word with Shoreside%' then raise; end if;
  end;
  perform public.set_own_standing('departed');
  select status into got from public.profiles where id = v_member;
  if got <> 'departed' then raise exception 'a club-paused member still cannot leave: got %', got; end if;

  -- put the fixture back exactly as found
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_staff, 'role','authenticated')::text, true);
  update public.profiles set status = was, status_set_by = was_by where id = v_member;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'all four standing transitions verified; fixture restored to %', was;
end $$;;
