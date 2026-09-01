-- This project's default privileges hand new tables SELECT alone, and every
-- policy written for the program tables was gating writes that no role could
-- attempt: staff creating a season met 42501 before is_staff() was ever
-- asked. House rule, restated from the other side: seal with a POLICY, but
-- the grant has to exist for the policy to be the thing that answers.
grant insert, update, delete on public.seasons to authenticated;
grant insert, update, delete on public.venues to authenticated;
grant insert, update, delete on public.voyage_series to authenticated;
grant insert, update, delete on public.member_event_proposals to authenticated;
grant insert, update, delete on public.sponsors to authenticated;
grant insert, update, delete on public.voyage_sponsors to authenticated;
-- voyage_daybeds: the only insert door is the definer RPC, deliberately —
-- DELETE alone is granted, for the Bridge's strike policy.
grant delete on public.voyage_daybeds to authenticated;;
