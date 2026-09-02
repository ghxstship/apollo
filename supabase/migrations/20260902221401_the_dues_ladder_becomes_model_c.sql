/* Model C, approved 2026-09-02. Thirteen plans plus Access become five.

   The old grid sold on the duration ceiling — four geographies times three
   ceilings — and nobody shops for how many hours they are permitted. The new
   ladder sells on commitment, carries a monthly PASS CREDIT rather than an
   event count, and keeps geography as the real second axis it already is.

   NOBODY IS REPRICED. Seven of the fourteen members holding a plan are real
   people, not fixtures, and silently moving a real member onto different terms
   is not a migration, it is a billing change they did not agree to. So the old
   rows are DEACTIVATED, not rewritten: every existing member keeps the exact
   plan and price they signed up for, and the new ladder serves new signups.
   That is why the unique constraint has to change — (plan_type, tier) was
   unique across ALL rows, so a retired plan permanently occupied its slot.
   It becomes unique across ACTIVE rows only, which is what it always meant.

   A CREDIT, NOT A COUNT. events_per_month promised one episode a month, which
   priced a three-hour rooftop the same as a nine-hour flagship and left the
   club guessing at utilisation. A credit lets a member spend it on one Away or
   three Passages, caps the downside an allowance cannot, and makes unspent
   value honest margin rather than a promise nobody called in.

   The full season at member rates is $8,925. Owner carries $8,400 for $5,940. */

alter table public.membership_plans
  add column if not exists monthly_credit_cents integer not null default 0;

comment on column public.membership_plans.monthly_credit_cents is
  'Pass credit carried each month. Spent against any episode the ceiling admits; not cash, not refundable.';

/* Unique among the plans on sale, not among every plan that ever was. */
alter table public.membership_plans drop constraint if exists membership_plans_plan_type_tier_key;
drop index if exists membership_plans_plan_type_tier_key;
create unique index membership_plans_one_live_plan_per_slot
  on public.membership_plans (plan_type, tier) where active;

do $$
declare retired int;
begin
  update public.membership_plans set active = false, published = false where active;
  get diagnostics retired = row_count;
  raise notice 'plans retired and left standing for the members on them: %', retired;
end $$;

insert into public.membership_plans
  (plan_type, tier, label, price_cents, annual_price_cents, events_per_month,
   monthly_credit_cents, class_ceiling, early_days, active, published)
values
  /* The way in. No dues, guest rates, and the shortest look at the calendar —
     early access is the thing dues actually buy. */
  ('access',   1, 'Access',   0,      null,    0, 0,      'passage',   7,  true, true),

  /* Deck and Cabin share a ceiling on purpose: they differ by how much they
     carry and how early they see the season, not by what they are allowed to
     attend. Both are Miami. */
  ('regional', 1, 'Deck',     9500,   95000,   0, 11000,  'expedition', 21, true, true),
  ('regional', 2, 'Cabin',    22500,  225000,  0, 29000,  'expedition', 30, true, true),

  /* Owner is the first rung that admits the flagship, and the first that
     admits a second city. */
  ('national', 3, 'Owner',    49500,  495000,  0, 70000,  'odyssey',    45, true, true),

  /* Founding is a patron tier, not a discount tier: invitation only, every
     city, and enough credit to carry the whole season with a guest on it. */
  ('global',   3, 'Founding', 100000, 1000000, 0, 120000, 'odyssey',    60, true, true);

/* The ladder must never invert: a plan that costs more has to carry more and
   see the calendar sooner, or the page cannot explain itself. */
do $$
declare bad text;
begin
  select string_agg(a.label || ' costs more than ' || b.label || ' and carries less', '; ')
    into bad
  from public.membership_plans a
  join public.membership_plans b
    on a.active and b.active
   and a.price_cents > b.price_cents
   and a.monthly_credit_cents < b.monthly_credit_cents;
  if bad is not null then
    raise exception 'the dues ladder inverts: %', bad;
  end if;
end $$;;
