-- A "refund" in this club has only ever meant account credit. Money never left
-- Stripe: there are three Stripe SDK calls in the whole application and none of
-- them is refunds.create. A member who asked for their money back got a balance
-- they may never spend, and a dispute nobody ever saw was money gone with no
-- record of it at all.
--
-- The blocker was identity. postSettlement recorded the checkout SESSION id in
-- a memo string; refunds need the payment intent, and a memo is not a key. This
-- column is that key, and it is also the spine of the reconciliation work that
-- comes next — you cannot match a ledger against Stripe if the ledger does not
-- say which Stripe object each row is.
alter table public.account_ledger
  add column if not exists stripe_ref text;

comment on column public.account_ledger.stripe_ref is
  'The Stripe object this row corresponds to — payment intent, invoice or charge. Written by the webhook, read by refunds and reconciliation. Never parsed out of memo.';

create index if not exists account_ledger_stripe_ref
  on public.account_ledger (stripe_ref) where stripe_ref is not null;

-- A dispute is not a refund and reporting them as one hides the thing an
-- operator most needs to see. Same money movement, entirely different story.
alter table public.account_ledger drop constraint if exists account_ledger_kind_check;
alter table public.account_ledger add constraint account_ledger_kind_check
  check (kind in ('pass','deposit','addon','galley','shop','dues','credit',
                  'refund','payment','plan_credit','dispute'));;
