/* Two records written entirely by triggers and definers, with no way to correct
   one. Both are append-only to the member — correctly — but a pause window
   opened by a status write that should not have happened, or a number released
   in error, is a record of something that did not occur. There was no door at
   all, not even for the Bridge, which meant the fix was a hand-written SQL
   statement against production.

   DELETE only, and staff only. Nothing gains INSERT or UPDATE: a window whose
   dates can be edited is a budget that can be reset, and a release whose
   released_at can be moved is the ninety-day hold with a dial on it. */
create policy "staff strike a pause window" on public.membership_pauses
  for delete to authenticated using (public.is_staff());

grant delete on public.membership_pauses to authenticated;
grant delete on public.member_number_releases to authenticated;
;
