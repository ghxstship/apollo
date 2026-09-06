-- The last opening in a_refund_never_exceeds_its_payment.
--
-- The cap tallies what has already gone back with
--   sum(abs(delta_cents)) where kind in ('refund','dispute') and delta_cents < 0
-- and then admits the new row on abs(). A refund with a POSITIVE delta
-- therefore passed the cap on the way in — abs() made it look like a return —
-- and was then invisible to every later refund against the same payment,
-- because the tally only counts negatives. Post +100 and then -100 against one
-- 100 payment and both are admitted.
--
-- Nothing is stolen by that pair: under this ledger's convention a payment is
-- a positive delta and a return is a negative one, so +100 credits and -100
-- debits and the member's balance is unmoved. What breaks is the record — two
-- refunds standing against one payment, and a cap that can no longer be
-- trusted to mean what it says.
--
-- Rather than teach the tally about a shape that should not exist, the shape
-- stops existing. A refund or a dispute that names a payment RETURNS money, so
-- it is negative. Checked against every row live: 18 refunds and every dispute
-- already are, and no payment is anything but positive.
--
-- Deliberately NOT constrained: a refund with a NULL stripe_ref. That is the
-- house credit — money the club gives back with no Stripe payment behind it —
-- and it is uncapped by design, because there is no payment to cap it against.
-- It is reachable only by the Bridge. If that capability should ever be
-- bounded, the bound is a policy question about how much an operator may credit
-- at once, not a fact the ledger can derive.
alter table public.account_ledger
  drop constraint if exists a_refund_against_a_payment_returns_money;

alter table public.account_ledger
  add constraint a_refund_against_a_payment_returns_money
  check (
    kind not in ('refund', 'dispute')
    or stripe_ref is null
    or delta_cents < 0
  );

comment on constraint a_refund_against_a_payment_returns_money on public.account_ledger is
  'A refund or dispute that names a Stripe payment is a return, so its delta is negative. A positive one used to pass the cap through abs() and then hide from every later refund on the same payment. A house credit carries no stripe_ref and is not covered here.';;
