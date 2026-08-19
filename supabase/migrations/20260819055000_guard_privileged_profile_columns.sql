-- Privilege escalation: any member could make themselves staff.
--
-- The profiles UPDATE policy is `id = auth.uid()`, which says WHICH ROW a member
-- may write and nothing about WHICH COLUMNS. RLS has no column granularity, so
-- the same policy that lets someone edit their bio let them set is_staff = true,
-- raise their own tier, lift a membership hold, or repoint stripe_customer_id at
-- another member's Stripe customer — which is billing-portal takeover, since
-- /api/stripe/portal opens whatever customer id sits on the profile.
--
-- Found by the expanded e2e suite, which escalated its own regional persona to
-- staff and then "failed" sixteen further checks that were really that one hole
-- being exercised.
--
-- Column-level GRANTs cannot express this: staff write these columns through the
-- same `authenticated` role. So it is a BEFORE UPDATE guard.
--
-- Two callers are legitimately privileged:
--   * staff, by is_staff()
--   * the system — the Stripe webhook drives handle_subscription_status, which
--     moves status and plan_id with no JWT at all, so auth.uid() is null there.

create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Staff and the system may move anything.
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
  -- The calendar token is a bearer secret: rotating it is fine, choosing it is
  -- not, because a chosen value could be aimed at another member's feed.
  if new.calendar_token is distinct from old.calendar_token then
    raise exception 'the season feed rotates from the Passbook, not by hand';
  end if;
  -- A Stripe customer may be claimed once, when there is none, and never
  -- repointed — otherwise the billing portal opens on somebody else's account.
  if old.stripe_customer_id is not null
     and new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'the billing account on file is not yours to move';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_columns on public.profiles;
create trigger guard_profile_columns
before update on public.profiles
for each row execute function public.guard_privileged_profile_columns();

-- Undo the escalation the suite performed while finding this.
update public.profiles
set is_staff = false, tier = 'regional'
where email = 'e2e-regional@lyre.social';

update public.profiles
set is_staff = false, tier = 'national'
where email = 'e2e-national@lyre.social';

update public.profiles
set is_staff = false, tier = 'global'
where email = 'e2e-global@lyre.social';

update public.profiles
set is_staff = false, tier = 'regional'
where email = 'e2e-paused@lyre.social';
