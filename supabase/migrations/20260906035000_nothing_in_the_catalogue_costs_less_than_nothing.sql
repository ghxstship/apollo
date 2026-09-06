-- Not one money column in the schema carried a non-negative check. The path
-- that makes it matter is short: a staff edit sets products.price_cents to a
-- negative number, place_shop_order sums it into shop_orders.total_cents, and
-- charge_shop_order posts -(total - discount) — which for a negative total is a
-- POSITIVE ledger line. A member credits their own account by ordering. The
-- same shape runs through the galley.
--
-- account_ledger.delta_cents and .tax_cents are deliberately absent from this
-- list and must stay absent: the ledger's sign convention is charges negative,
-- money-in positive, so a negative delta is the commonest correct row in the
-- table. Nothing here touches it.
--
-- Every predicate below was counted against live before it was written. All
-- nineteen returned zero, so each constraint is added valid rather than
-- deferred, and each names the thing it protects rather than the column it
-- happens to sit on.

alter table public.products drop constraint if exists a_price_is_not_below_nothing;
alter table public.products add constraint a_price_is_not_below_nothing
  check (price_cents >= 0);

-- The discount clause is the one that stops the credit-minting path outright:
-- a discount larger than the total made charge_shop_order post money IN.
alter table public.shop_orders drop constraint if exists an_order_does_not_pay_the_member;
alter table public.shop_orders add constraint an_order_does_not_pay_the_member
  check (total_cents >= 0 and discount_cents >= 0 and discount_cents <= total_cents);

alter table public.shop_order_items drop constraint if exists a_line_is_not_below_nothing;
alter table public.shop_order_items add constraint a_line_is_not_below_nothing
  check (price_cents >= 0);

alter table public.galley_items drop constraint if exists a_galley_price_is_not_below_nothing;
alter table public.galley_items add constraint a_galley_price_is_not_below_nothing
  check (price_cents >= 0);

alter table public.galley_order_items drop constraint if exists a_ticket_line_is_not_below_nothing;
alter table public.galley_order_items add constraint a_ticket_line_is_not_below_nothing
  check (price_cents >= 0);

alter table public.galley_orders drop constraint if exists a_ticket_does_not_pay_the_member;
alter table public.galley_orders add constraint a_ticket_does_not_pay_the_member
  check (total_cents >= 0);

alter table public.addons drop constraint if exists an_addon_is_not_below_nothing;
alter table public.addons add constraint an_addon_is_not_below_nothing
  check (price_cents >= 0);

alter table public.episodes drop constraint if exists a_pass_is_not_below_nothing;
alter table public.episodes add constraint a_pass_is_not_below_nothing
  check (price_cents >= 0);

alter table public.membership_plans drop constraint if exists dues_are_not_below_nothing;
alter table public.membership_plans add constraint dues_are_not_below_nothing
  check (price_cents >= 0
     and (annual_price_cents is null or annual_price_cents >= 0)
     and monthly_credit_cents >= 0);

alter table public.invoices drop constraint if exists an_invoice_is_not_below_nothing;
alter table public.invoices add constraint an_invoice_is_not_below_nothing
  check (amount_cents >= 0);

-- installments was already bounded 2..6 and paid_count was not bounded at all,
-- so a plan could record more instalments paid than it has.
alter table public.installment_plans drop constraint if exists a_plan_adds_up;
alter table public.installment_plans add constraint a_plan_adds_up
  check (total_cents >= 0
     and down_payment_cents >= 0
     and down_payment_cents <= total_cents
     and paid_count >= 0
     and paid_count <= installments);

alter table public.rewards drop constraint if exists a_reward_is_not_below_nothing;
alter table public.rewards add constraint a_reward_is_not_below_nothing
  check (cost_fm >= 0);

alter table public.crew drop constraint if exists a_day_rate_is_not_below_nothing;
alter table public.crew add constraint a_day_rate_is_not_below_nothing
  check (day_rate_cents is null or day_rate_cents >= 0);

alter table public.venues drop constraint if exists a_venue_fee_is_not_below_nothing;
alter table public.venues add constraint a_venue_fee_is_not_below_nothing
  check (fee_cents is null or fee_cents >= 0);

alter table public.vessels drop constraint if exists a_hull_day_rate_is_not_below_nothing;
alter table public.vessels add constraint a_hull_day_rate_is_not_below_nothing
  check (day_rate_cents is null or day_rate_cents >= 0);

-- A code that may be used no times is not a code, and a code used more times
-- than it allows is a code that was not counted.
alter table public.promo_codes drop constraint if exists a_code_has_uses_to_give;
alter table public.promo_codes add constraint a_code_has_uses_to_give
  check (max_uses >= 1 and uses >= 0 and value >= 0);

alter table public.invites drop constraint if exists an_invite_has_signatures_to_give;
alter table public.invites add constraint an_invite_has_signatures_to_give
  check (max_uses >= 1 and uses >= 0 and uses <= max_uses);

-- The month's plan credit cannot be spent past what it granted. Not on the
-- reported list; the same class, and pass_credit_left subtracts one from the
-- other without asking.
alter table public.pass_credits drop constraint if exists a_credit_is_not_spent_past_itself;
alter table public.pass_credits add constraint a_credit_is_not_spent_past_itself
  check (granted_cents >= 0 and spent_cents >= 0 and spent_cents <= granted_cents);

-- invoices.status is the one text status on the money path with neither a
-- check nor a foreign key. Its only writer is the Stripe webhook, which passes
-- Stripe's own invoice status straight through — draft, open, paid, void,
-- uncollectible, and nothing else in twelve years of that API. The reason this
-- constraint is worth having is not that the club writes a wrong value; it is
-- that a wrong value would be silent, and this is the money path.
--
-- READ THIS BEFORE APPLYING: syncInvoice() in src/app/api/stripe/webhook/route.ts
-- awaited that upsert and never looked at the error, so with this constraint in
-- place a status outside the five would have made the invoice quietly fail to
-- sync rather than raise. That error check goes in with this migration. If
-- Stripe ever adds a sixth status the webhook will now throw, Stripe will
-- retry, and somebody will see it — which is the failure this is for.
alter table public.invoices drop constraint if exists an_invoice_carries_a_status_stripe_uses;
alter table public.invoices add constraint an_invoice_carries_a_status_stripe_uses
  check (status in ('draft','open','paid','void','uncollectible'));
