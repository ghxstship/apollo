-- Staff can strike a table and its aftermath — the same clear-the-queue right
-- the funnels needed. A member never deletes a match; the crew can.
create policy "staff clear tables" on public.table_seats
  for delete to authenticated using (public.is_staff());
create policy "staff clear picks" on public.table_picks
  for delete to authenticated using (public.is_staff());
create policy "staff clear matches" on public.matches
  for delete to authenticated using (public.is_staff());
