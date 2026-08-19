-- The Bridge cannot support a member whose ledger it cannot see. Members
-- still read only their own; staff read the roll.
drop policy if exists "own fathoms" on public.fathoms_ledger;
create policy "own or staff fathoms" on public.fathoms_ledger
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());

-- Same reasoning for redemptions and pass usage already hold; confirm the
-- reward redemptions policy covers staff.
drop policy if exists "own or staff redemptions" on public.reward_redemptions;
create policy "own or staff redemptions" on public.reward_redemptions
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
