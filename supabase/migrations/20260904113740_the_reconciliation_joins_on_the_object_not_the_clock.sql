-- The reconciliation view could not find an exception. Both of its predicates
-- were uncorrelated: the unposted half asked whether ANY Stripe-sourced ledger
-- row existed within two hours of the event, so one posted payment hid every
-- unposted event beside it; the unmatched half asked whether ANY event had
-- arrived in the prior day, and never mentioned the ledger row it was meant to
-- be checking. The page then printed "Nothing unmatched" on the strength of
-- that, which is a false assurance and worse than no view at all.
--
-- It could not be correlated because stripe_events recorded the EVENT id and
-- the ledger records the OBJECT id — the session, the invoice, the payment
-- intent. Nothing on either side named the other. So the event log now keeps
-- the id the ledger will use for it, stamped by the webhook at receipt, and
-- the amount, so a $0 invoice (a trial, a full coupon) that correctly posts
-- nothing is not reported as missing.
--
-- Rows from before this column existed carry null and are not judged — the
-- payload was never stored and cannot be recovered. The ledger side is judged
-- only from the first tagged event onward, for the same reason. Before that
-- moment the view says nothing, which is the honest answer.

alter table public.stripe_events
  add column if not exists object_id text,
  add column if not exists amount_cents integer;

comment on column public.stripe_events.object_id is
  'The id the ledger records for this event: the checkout session, the invoice, or the payment intent for a refund or dispute. Null on rows received before it was kept.';

create index if not exists stripe_events_by_object on public.stripe_events (object_id) where object_id is not null;

create or replace view public.stripe_reconciliation
with (security_invoker = on) as
select
  'unposted'::text as issue,
  e.object_id as stripe_id,
  e.type as detail,
  e.received_at as at,
  null::uuid as profile_id,
  null::int as delta_cents
from public.stripe_events e
where e.type in ('checkout.session.completed','invoice.paid','charge.refunded',
                 'charge.dispute.created','charge.dispute.closed')
  and e.object_id is not null
  and coalesce(e.amount_cents, 0) > 0
  and e.received_at < now() - interval '10 minutes'
  and not exists (
    select 1 from public.account_ledger l
    where l.stripe_ref = e.object_id
       or l.idem_key like 'stripe:%:' || e.object_id || '%'
  )

union all

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
  and l.created_at >= coalesce(
        (select min(t.received_at) from public.stripe_events t where t.object_id is not null),
        now())
  and not exists (
    select 1 from public.stripe_events e
    where e.object_id is not null
      and (e.object_id = l.stripe_ref
           or l.idem_key like 'stripe:%:' || e.object_id || '%')
  );

grant select on public.stripe_reconciliation to authenticated;

comment on view public.stripe_reconciliation is
  'Exceptions only, both directions, joined on the Stripe object id rather than on the clock: money events with no ledger row, and ledger rows naming a Stripe object no event announced.';;
