-- Three of the new RPCs revoked PUBLIC without granting authenticated back —
-- and authenticated only ever had EXECUTE through PUBLIC, so the very callers
-- each function exists for (the Bridge for two, any active member for the
-- daybed) were refused at the grant, before the function's own check could
-- speak. The house rule cuts both ways: seal with the check inside, but hand
-- the door key to the role that is meant to knock.
grant execute on function public.extend_the_series(uuid, integer) to authenticated;
grant execute on function public.decide_a_proposal(uuid, text, text) to authenticated;
grant execute on function public.claim_a_daybed(uuid) to authenticated;

-- A ruled-on proposal had no way off the books: members may withdraw only
-- while submitted, staff held UPDATE alone. The Bridge may now strike a row
-- outright — the fixture-sweep case and the right-to-be-forgotten case are
-- the same door.
create policy "the bridge strikes the record" on public.member_event_proposals
  for delete to authenticated using (public.is_staff());;
