-- Two of this guard's refusals sent members to doors that were not there.
--
-- 'the address on file changes through the gangway' — the gangway is a
-- magic-link sign-in and nothing else. There is no email-change flow anywhere
-- in the product, so a member whose mailbox is gone cannot sign in and cannot
-- fix it, and the refusal told them to go and do exactly the thing that cannot
-- be done. It names Shoreside now, which is a real desk with real people on it,
-- and which is where every other refusal in the product already sends them.
--
-- 'the season feed rotates from your member card, not by hand' — /card carried
-- the address, warned that anyone holding it reads your season, and offered no
-- way to take it back. The refusal was right about where rotation belongs and
-- wrong that it existed. So it exists: rotate_calendar_token, on the
-- set_own_standing pattern — a transaction-local flag the guard recognises, so
-- one function may pass and a raw UPDATE still may not. A member who pasted
-- their feed address somewhere public can now cut it dead in one press, and the
-- old address stops resolving the moment the new token is written.
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
  -- Who placed a hold, and when, is the record of the decision. Only
  -- stamp_who_changed_standing writes these.
  if new.status_set_by is distinct from old.status_set_by
     or new.status_set_at is distinct from old.status_set_at then
    raise exception 'membership standing moves from the Bridge, not from here';
  end if;
  if new.plan_id is distinct from old.plan_id then
    raise exception 'a plan changes through billing, not by hand';
  end if;
  if new.member_no is distinct from old.member_no then
    raise exception 'a member number is issued once';
  end if;
  if new.email is distinct from old.email then
    raise exception 'the address on file changes through Shoreside, not from here';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception 'the date you came aboard is a matter of record';
  end if;
  if new.calendar_token is distinct from old.calendar_token
     and coalesce(current_setting('app.rotate_feed', true), 'off') <> 'on' then
    raise exception 'the season feed rotates from the control on your member card, not by hand';
  end if;
  if new.phone_verified is distinct from old.phone_verified
     and coalesce(current_setting('app.verify_phone', true), 'off') <> 'on' then
    raise exception 'a number is verified by answering it, not by saying so';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and coalesce(current_setting('app.claim_stripe', true), 'off') <> 'on' then
    raise exception 'the billing account on file is not yours to set';
  end if;
  return new;
end;
$function$;

-- Revoking a leaked address is not a privilege, so it is not gated on standing:
-- a paused membership may still cut a feed somebody else is reading. Nothing
-- but the caller's own row is ever touched, and the caller is auth.uid(), not
-- an argument — there is no id to pass and therefore no id to get wrong.
create or replace function public.rotate_calendar_token()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_new uuid := gen_random_uuid();
begin
  if v_uid is null then raise exception 'sign in required'; end if;

  perform set_config('app.rotate_feed', 'on', true);
  update public.profiles set calendar_token = v_new where id = v_uid;
  perform set_config('app.rotate_feed', 'off', true);

  if not found then raise exception 'no such member'; end if;
  return v_new;
end;
$function$;

revoke execute on function public.rotate_calendar_token() from public, anon;
grant execute on function public.rotate_calendar_token() to authenticated;

comment on function public.rotate_calendar_token() is
  'Issues the caller a new season-feed token and kills the old address. The only path past the calendar_token guard; the control lives on /card.';;
