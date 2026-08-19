-- The Bridge could read every member and correct none of them.
--
-- profiles carried exactly two policies: "members read profiles" (SELECT true)
-- and "own profile update" (UPDATE id = auth.uid()). There was no staff UPDATE
-- policy, so the console that runs the club could not fix a misspelled name,
-- place a member on hold, or confer staff standing. Everything that does move a
-- profile today goes through a definer path — accept_application on intake,
-- handle_subscription_status from the Stripe webhook — which is why nothing
-- appeared broken: the gap is in what the Bridge cannot do, not in what it does.
--
-- Surfaced while making the e2e suite idempotent: nothing but a definer function
-- could clear a stripe_customer_id, so the suite could not clean up after
-- itself, which is the same gap wearing a different hat.
--
-- Safe to add now, and not before: guard_privileged_profile_columns already
-- draws the line between what a member may change and what only staff may, so
-- this policy widens the Bridge's reach without widening a member's.

create policy "staff correct member records" on public.profiles
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());
