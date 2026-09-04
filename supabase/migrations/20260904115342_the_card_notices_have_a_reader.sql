-- card_notices shipped with row security on and no policy at all, which the
-- schema invariants call a policy-less table: sealed by accident rather than
-- by a rule anyone wrote down. The Bridge reads it, the same as the dunning
-- log beside it; the cron writes it as definer.
create policy "the bridge reads what was sent about cards" on public.card_notices
  for select to authenticated using (public.is_staff());
grant select on public.card_notices to authenticated;;
