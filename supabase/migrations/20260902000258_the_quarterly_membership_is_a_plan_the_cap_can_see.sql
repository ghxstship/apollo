-- DECISION: the Club Lifestyle Membership (operations.md §3: $2,500 a quarter,
-- priority access to 4 sailings, fast-track vetting, daybed priority, one
-- guest pass, capped at 20 active) becomes a membership_plans row so a
-- subscription can point at it and guard_the_membership_cap can count it.
-- It is an ACCESS plan, not a tier: it grants places, and leaves the member's
-- tier where it stands. Four sailings a quarter is stated as two a month.
insert into public.membership_plans
  (plan_type, tier, label, price_cents, events_per_month, class_ceiling, active, early_days, product_slug, published)
values
  ('access', 2, 'Club Lifestyle Membership', 250000, 2, null, true, 21, 'quarterly_membership', true)
on conflict (plan_type, tier) do update
  set label = excluded.label, price_cents = excluded.price_cents, events_per_month = excluded.events_per_month,
      early_days = excluded.early_days, product_slug = excluded.product_slug, published = excluded.published, active = true;;
