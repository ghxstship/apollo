-- claim_stripe_customer() could not do its own job: SECURITY DEFINER changes the
-- executing role, not the JWT, so auth.uid() inside it is still the member and
-- the guard trigger refused the write.
--
-- The RPC now raises a transaction-local flag that the guard honours. A member
-- cannot raise it themselves — set_config lives in pg_catalog and PostgREST only
-- exposes public, so the flag is reachable only from inside this function, and
-- it falls with the transaction either way.

create or replace function public.claim_stripe_customer(p_customer_id text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'sign in required'; end if;
  if p_customer_id is null or length(trim(p_customer_id)) = 0 then
    raise exception 'a customer id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('stripe_claim:' || p_customer_id));

  if exists (
    select 1 from public.profiles
    where stripe_customer_id = p_customer_id and id <> me
  ) then
    raise exception 'that billing account belongs to another member';
  end if;

  if exists (
    select 1 from public.profiles
    where id = me and stripe_customer_id is not null
      and stripe_customer_id <> p_customer_id
  ) then
    raise exception 'a billing account is already on file';
  end if;

  perform set_config('app.claim_stripe', 'on', true);
  update public.profiles
  set stripe_customer_id = p_customer_id
  where id = me and stripe_customer_id is null;
  perform set_config('app.claim_stripe', 'off', true);
end;
$$;

revoke execute on function public.claim_stripe_customer(text) from public, anon;
grant execute on function public.claim_stripe_customer(text) to authenticated;

create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql security definer set search_path = public
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
  if new.status is distinct from old.status then
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
    raise exception 'the season feed rotates from the Passbook, not by hand';
  end if;
  -- Only claim_stripe_customer() may move this, and only to an id no other
  -- member holds.
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and coalesce(current_setting('app.claim_stripe', true), 'off') <> 'on' then
    raise exception 'the billing account on file is not yours to set';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_privileged_profile_columns() from public, anon, authenticated;
