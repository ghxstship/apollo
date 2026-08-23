-- /you offers Pause, Resume and Depart, and all three were dead: setStatus()
-- writes profiles.status directly and guard_privileged_profile_columns raises on
-- any member-initiated status change, so every click returned the generic
-- "That didn't land." Self-service departure was impossible too, which is not a
-- thing to make someone phone in.
--
-- Standing still does not move by hand — the guard keeps refusing raw UPDATEs.
-- It moves through one RPC, on the claim_stripe pattern: a transaction-local
-- flag the guard recognises, so only this function may pass. Members may hold
-- and resume their own membership and may leave; coming back from departed is
-- the Bridge's call, as the farewell says ("a word to Shoreside is enough").
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if new.is_staff is distinct from old.is_staff then
    raise exception 'staff standing is not yours to grant';
  end if;
  if new.tier is distinct from old.tier then
    raise exception 'membership tier moves from the Bridge, not from here';
  end if;
  if new.status is distinct from old.status
     and coalesce(current_setting('app.set_standing', true), 'off') <> 'on' then
    raise exception 'membership standing moves from the Bridge, not from here';
  end if;
  if new.plan_id is distinct from old.plan_id then
    raise exception 'a plan changes through billing, not by hand';
  end if;
  if new.member_no is distinct from old.member_no then
    raise exception 'a member number is issued once';
  end if;
  if new.email is distinct from old.email then
    raise exception 'the address on file changes through the gangway';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception 'the date you came aboard is a matter of record';
  end if;
  if new.calendar_token is distinct from old.calendar_token then
    raise exception 'the season feed rotates from your member card, not by hand';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and coalesce(current_setting('app.claim_stripe', true), 'off') <> 'on' then
    raise exception 'the billing account on file is not yours to set';
  end if;
  return new;
end;
$function$;

create or replace function public.set_own_standing(p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now text;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if p_status not in ('active', 'paused', 'departed') then
    raise exception 'that is not a standing';
  end if;

  select status into v_now from public.profiles where id = v_uid;
  if v_now is null then raise exception 'no such member'; end if;
  if v_now = p_status then return; end if;

  -- Leaving is yours to do; coming back from it is a word with Shoreside.
  if v_now = 'departed' then
    raise exception 'your place is closed — a word with Shoreside opens it again';
  end if;

  perform set_config('app.set_standing', 'on', true);
  update public.profiles set status = p_status where id = v_uid;
  perform set_config('app.set_standing', 'off', true);
end;
$$;

revoke execute on function public.set_own_standing(text) from public, anon;
grant execute on function public.set_own_standing(text) to authenticated;

comment on function public.set_own_standing(text) is
  'A member holds, resumes or leaves their own membership. The only path past the standing guard; returning from departed is the Bridge''s call.';
