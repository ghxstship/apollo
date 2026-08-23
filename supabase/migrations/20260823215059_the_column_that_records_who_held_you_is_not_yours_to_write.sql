-- I added status_set_by last round to record who imposed a hold, and did not
-- add it to the guard that says which profile columns a member may write. So
-- the whole "a hold the club puts on is not yours to lift" family came down to
-- two calls: PATCH your own status_set_by to your own id, then
-- set_own_standing('active'). It also re-armed the billing route, since
-- `status_set_by is distinct from id` then reads false. A new column and an
-- existing guard that has never heard of it.
--
-- And the honest case was worse than the dishonest one: the `paused` branch of
-- handle_subscription_status writes profiles.status with no auth.uid(), so
-- stamp_who_changed_standing recorded NULL, NULL is distinct from id, and a
-- member who paused their own dues in the Stripe portal and then resumed them
-- was held forever with no self-serve route out. The guard I wrote to stop
-- members escaping holds was locking members in.
--
-- guard_profile_columns fires before stamp_who_changed_standing (BEFORE UPDATE,
-- and 'g' sorts before 's'), so the guard sees the caller's own values.
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
    raise exception 'the address on file changes through the gangway';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception 'the date you came aboard is a matter of record';
  end if;
  if new.calendar_token is distinct from old.calendar_token then
    raise exception 'the season feed rotates from your member card, not by hand';
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
$$;

-- A writer that deliberately names who is behind a standing change is honoured;
-- everything else is stamped with whoever is calling.
create or replace function public.stamp_who_changed_standing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status is distinct from old.status then
    if new.status_set_by is distinct from old.status_set_by then
      -- The caller said who. Only trusted definers reach here; the column
      -- guard refuses a member outright.
      new.status_set_at := now();
    else
      new.status_set_by := auth.uid();
      new.status_set_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- Pausing your own dues in the billing portal is your act, and resuming them
-- must undo it. Name the member as the one who paused.
create or replace function public.handle_subscription_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('active','trialing') then
    update public.profiles
       set status = case
             when status = 'paused' and status_set_by is distinct from id then status
             else 'active'
           end,
           plan_id = coalesce(new.plan_id, plan_id)
     where id = new.profile_id and status <> 'departed';
  elsif new.status = 'paused' then
    update public.profiles
       set status = 'paused', status_set_by = id
     where id = new.profile_id;
  elsif new.status in ('canceled','past_due') and old.status in ('active','trialing') then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.profile_id, 'word',
      case when new.status = 'past_due' then 'Dues did not clear.' else 'Membership closed.' end,
      case when new.status = 'past_due'
           then 'The card was declined. Settle in the portal and nothing else changes.'
           else 'Your dues have lapsed. A word to Shoreside puts you back on the water.' end);
  end if;
  return new;
end
$$;

-- Leaving is not a way around a hold either: a member under one cannot walk out
-- of it into 'departed' and overwrite the club's mark on the way.
create or replace function public.set_own_standing(p_status text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_now text;
  v_by  uuid;
begin
  if v_uid is null then raise exception 'sign in required'; end if;
  if p_status not in ('active', 'paused', 'departed') then
    raise exception 'that is not a standing';
  end if;

  select status, status_set_by into v_now, v_by from public.profiles where id = v_uid;
  if v_now is null then raise exception 'no such member'; end if;
  if v_now = p_status then return; end if;

  if v_now = 'departed' then
    raise exception 'your place is closed — a word with Shoreside opens it again';
  end if;

  if v_now = 'paused' and v_by is distinct from v_uid then
    raise exception 'that hold was placed by the club — a word with Shoreside lifts it';
  end if;

  perform set_config('app.set_standing', 'on', true);
  update public.profiles set status = p_status where id = v_uid;
  perform set_config('app.set_standing', 'off', true);
end;
$$;

-- Existing rows where nobody was recorded: treat as the member's own, so the
-- honest self-pausers are not stranded. A club hold placed from here on carries
-- the operator's id.
update public.profiles set status_set_by = id
 where status = 'paused' and status_set_by is null;;
