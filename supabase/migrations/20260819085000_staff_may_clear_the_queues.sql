-- Three tables could be written but never cleared.
--
-- applications and crew_candidates are the two funnels anon may INSERT into —
-- anyone on the internet can lodge a row. Neither carried a DELETE policy, so
-- nobody, staff included, could remove a spam application or a duplicate. The
-- queue only ever grew, and the console had no remedy at all.
--
-- shop_orders had the same hole from the inside: a member may place an order,
-- and nothing could remove an erroneous one. The money trail lives in
-- account_ledger, which is untouched by this — an order is the request, not the
-- record of payment.
--
-- Found while making the e2e suite idempotent: its own funnel rows accumulated
-- run after run and could not be swept, which is the operational gap in
-- miniature.

create policy "staff clear the application queue" on public.applications
  for delete to authenticated using (public.is_staff());

create policy "staff clear the crew queue" on public.crew_candidates
  for delete to authenticated using (public.is_staff());

create policy "staff remove an erroneous order" on public.shop_orders
  for delete to authenticated using (public.is_staff());
