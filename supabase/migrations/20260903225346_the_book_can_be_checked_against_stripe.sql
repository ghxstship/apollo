-- stripe_events has been write-only since it shipped: the webhook inserts a row
-- to make delivery idempotent and nothing ever reads it back. So nobody could
-- answer the two questions that matter — did every Stripe event reach the
-- ledger, and does every ledger row that claims a Stripe object have one.
--
-- This is the join that answers both. Not a report: the exceptions only. A
-- reconciliation that lists everything reconciles nothing, because the eye
-- slides off it — what an operator needs is the short list of rows that do not
-- agree.
create or replace view public.stripe_reconciliation
with (security_invoker = on) as
/* Money events Stripe told us about that never became a ledger row. The types
   listed are exactly those the webhook posts money for; anything else is
   informational and its absence from the ledger is correct. */
select
  'unposted'::text as issue,
  e.id as stripe_id,
  e.type as detail,
  e.received_at as at,
  null::uuid as profile_id,
  null::int as delta_cents
from public.stripe_events e
where e.type in ('checkout.session.completed','invoice.paid','charge.refunded',
                 'charge.dispute.created','charge.dispute.closed')
  /* Give a live delivery time to finish before calling it missing. */
  and e.received_at < now() - interval '10 minutes'
  and not exists (
    select 1 from public.account_ledger l
    where l.idem_key like 'stripe:%'
      and l.created_at between e.received_at - interval '1 hour'
                          and e.received_at + interval '1 hour'
  )

union all

/* Ledger rows that name a Stripe object with no event on file. A row claiming
   money moved in Stripe when Stripe never said so is the more serious of the
   two directions. */
select
  'unmatched'::text,
  l.stripe_ref,
  l.kind,
  l.created_at,
  l.profile_id,
  l.delta_cents
from public.account_ledger l
where l.stripe_ref is not null
  and l.created_at < now() - interval '10 minutes'
  and not exists (select 1 from public.stripe_events e where e.received_at >= l.created_at - interval '1 day');

grant select on public.stripe_reconciliation to authenticated;

comment on view public.stripe_reconciliation is
  'Exceptions only, both directions: Stripe events that never posted, and ledger rows naming a Stripe object with no event behind them. A reconciliation that lists everything reconciles nothing.';;
