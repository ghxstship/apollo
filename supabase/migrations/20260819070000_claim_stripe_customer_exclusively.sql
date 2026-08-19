-- Residual billing-takeover path left by the first profiles guard.
--
-- That guard allowed a member to CLAIM stripe_customer_id while it was null and
-- only blocked repointing an existing one. But /api/stripe/portal opens the
-- billing portal for whatever customer id sits on the profile — so any member
-- who had never subscribed could set theirs to another member's Stripe customer
-- and walk into that member's billing.
--
-- The column is now closed to members entirely. The subscribe route claims it
-- through this RPC instead, which refuses a customer id that any other profile
-- already holds — so the only id you can claim is one nobody else has, which in
-- practice is the one Stripe just minted for you.

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

  -- Serialise the claim so two requests cannot both find it unheld.
  perform pg_advisory_xact_lock(hashtext('stripe_claim:' || p_customer_id));

  if exists (
    select 1 from public.profiles
    where stripe_customer_id = p_customer_id and id <> me
  ) then
    raise exception 'that billing account belongs to another member';
  end if;

  update public.profiles
  set stripe_customer_id = p_customer_id
  where id = me and stripe_customer_id is null;
end;
$$;

revoke execute on function public.claim_stripe_customer(text) from public, anon;
grant execute on function public.claim_stripe_customer(text) to authenticated;

-- Close the column to members. The RPC above is definer, so it still writes.
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
  -- No longer claimable by hand at all: claim_stripe_customer() does it, and
  -- refuses an id another member already holds.
  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'the billing account on file is not yours to set';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_privileged_profile_columns() from public, anon, authenticated;

-- Undo the claim the suite made while finding this.
update public.profiles
set stripe_customer_id = null
where stripe_customer_id = 'cus_e2e_takeover';
