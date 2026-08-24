-- Both Stripe handlers were SELECT-then-INSERT with nothing underneath them.
-- `account_ledger` has only a primary key on id, so two concurrent deliveries
-- of the same `checkout.session.completed` both read "no existing row" and both
-- insert: the member's house account is credited twice for one card payment.
-- That is real money off the club. `invoice.paid` has the same shape and posts
-- a duplicate charge/payment pair — it nets to zero on the balance, but the
-- statement is then a lie, and a statement people read is the product.
--
-- Sequential retries WERE caught, because the first insert has committed by
-- then. Only truly concurrent duplicates broke it — which is exactly what a
-- webhook sender's retry storm looks like.
--
-- A guard in application code cannot fix this. Two processes cannot agree by
-- each asking a question; something has to refuse. So the ledger gets a key
-- that names the external event, and the database refuses the second one.
-- The handlers then treat a unique violation as "already done", which is the
-- truth, rather than as an error.
alter table public.account_ledger
  add column if not exists idem_key text;

comment on column public.account_ledger.idem_key is
  'Names the external event this row settles (e.g. stripe:session:cs_123:payment). Unique when present, so a repeated webhook delivery cannot post the same money twice.';

create unique index if not exists account_ledger_idem_key_once
  on public.account_ledger (idem_key)
  where idem_key is not null;
;
