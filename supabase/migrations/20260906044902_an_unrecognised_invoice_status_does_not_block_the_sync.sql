-- An unrecognised invoice status does not block the sync (decided 2026-09-06).
--
-- an_invoice_carries_a_status_stripe_uses named the five statuses Stripe has
-- used for twelve years, and it was right to: invoices.status was the one text
-- status on the money path with neither a check nor a foreign key, and a wrong
-- value there would have been silent. It came in with the error check in
-- syncInvoice(), so a sixth status would throw, Stripe would retry, and
-- somebody would see it.
--
-- Which is the right failure for a wrong value and the wrong failure for a new
-- one. Stripe adds a status; every invoice carrying it now fails the upsert;
-- the webhook throws; Stripe retries on a schedule and gives up; and the
-- member's account is missing an invoice with nothing on the screen to say so.
-- The retries are what makes it look handled — they end, and the row never
-- arrives. That is the silent failure-to-sync this constraint exists to
-- prevent, reintroduced from the other direction.
--
-- So the sixth value is 'unknown', and it is the club's word rather than
-- Stripe's. The invoice syncs, labelled honestly as a status the club does not
-- recognise; the real word Stripe sent is written to app_errors under the kind
-- stripe-unknown, where /bridge/reports already reads it; and somebody adds the
-- status to the list when they have decided what it means. A wrong label on a
-- member's account is worse than nothing to look at, and better than no row.
--
-- The two halves land together. This constraint alone would only widen the
-- hole: syncInvoice() passes Stripe's status straight through, so a sixth value
-- would be stored verbatim, pass nothing, and mean nothing. The mapping and the
-- app_errors line are in src/app/api/stripe/webhook/route.ts, in the same
-- change as this file.
alter table public.invoices drop constraint if exists an_invoice_carries_a_status_stripe_uses;
alter table public.invoices add constraint an_invoice_carries_a_status_stripe_uses
  check (status in ('draft','open','paid','void','uncollectible','unknown'));

comment on constraint an_invoice_carries_a_status_stripe_uses on public.invoices is
  'The five statuses Stripe uses, plus unknown — the club''s word for a status it has not been taught yet. The webhook maps anything it does not recognise onto unknown and writes the real value to app_errors, so the invoice still reaches the member''s account.';
