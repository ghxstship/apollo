/* "Capped at 20 active" — operations.md §3, and the only cap in that document
   with nothing in apollo to enforce it.

   It goes on `subscriptions` rather than on a new holdings table because
   `subscriptions` IS this schema's membership-holding record: it carries the
   lifecycle the kit draws (ACTIVE → past_due is CARD EXPIRING, paused is PAUSED
   AT SEA, canceled is LAPSED), it is what handle_subscription_status and
   src/lib/dues.ts already read, and a parallel table would mean two answers to
   "is this member in good standing" with no rule about which wins.

   The count is the rsvp_guard() shape verbatim: take the advisory lock, count,
   then act. A check constraint cannot do it — the cap is a property of every
   other row, not of this one — and counting outside a lock means the twentieth
   and twenty-first applicants both read nineteen and both get in.

   Inert today by design: no membership_plan names a product yet, so this
   returns on its first select for all thirteen. It becomes live the moment
   someone maps a plan, which is exactly when it needs to be already correct. */
create or replace function public.guard_the_membership_cap()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_product record;
  v_held integer;
begin
  /* incomplete and canceled hold nothing. past_due and paused DO: the kit says
     a card expiring means "update it before Aug 30 or the seat opens up" — it
     has not opened up yet — and a pause keeps the number. Counting them out
     would let the club sell a twenty-first place to someone whose place is
     still theirs. */
  if new.status not in ('active', 'trialing', 'past_due', 'paused') then
    return new;
  end if;

  /* An update that neither takes a place nor moves plan is not a new claim.
     Without this, every webhook touch of a live subscription re-runs the count
     and the twentieth member cannot renew their own membership. */
  if tg_op = 'UPDATE'
     and old.status in ('active', 'trialing', 'past_due', 'paused')
     and old.plan_id is not distinct from new.plan_id then
    return new;
  end if;

  select cp.slug, cp.label, cp.active_cap into v_product
  from public.membership_plans mp
  join public.club_products cp on cp.slug = mp.product_slug
  where mp.id = new.plan_id and cp.active_cap is not null;
  if v_product.slug is null then return new; end if;

  perform pg_advisory_xact_lock(hashtext('club_product:' || v_product.slug));

  select count(*) into v_held
  from public.subscriptions s
  join public.membership_plans mp on mp.id = s.plan_id
  where mp.product_slug = v_product.slug
    and s.status in ('active', 'trialing', 'past_due', 'paused')
    and s.id <> new.id;

  if v_held >= v_product.active_cap then
    raise exception '% is closed — % places, all held. Shoreside keeps the list in order.',
      v_product.label, v_product.active_cap;
  end if;
  return new;
end;
$$;

create trigger guard_the_membership_cap
  before insert or update on public.subscriptions
  for each row execute function public.guard_the_membership_cap();

/* A trigger function is called by the trigger, never by a caller. An EXECUTE
   grant on one is a way to run definer code with arguments of your choosing,
   and security_report() fails the build over it. */
revoke all on function public.guard_the_membership_cap() from public, anon, authenticated;
;
