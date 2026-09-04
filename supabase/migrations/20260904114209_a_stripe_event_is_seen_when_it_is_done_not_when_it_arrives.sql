-- The webhook recorded an event the moment it arrived and, on a duplicate id,
-- answered "replay" and did nothing. So an event whose handler threw halfway
-- — a ledger insert failing on anything but a duplicate — came back from
-- Stripe's retry, hit the unique index, and was waved through as already seen.
-- Once. Forever. At-most-once delivery, wearing an idempotency badge.
--
-- Seen now means finished. The row is still written first, so two concurrent
-- deliveries still race on the primary key and one loses; but the loser reads
-- processed_at, and if the winner never finished, the loser does the work.

alter table public.stripe_events
  add column if not exists processed_at timestamptz;

comment on column public.stripe_events.processed_at is
  'When the handler finished. Null means it arrived and was not completed — a retry with the same id should do the work rather than call it a replay.';

-- Every row before this column existed was handled under the old rule; mark
-- them finished so the reconciliation does not raise the whole history.
update public.stripe_events set processed_at = received_at where processed_at is null;;
