-- "manage own membership" was FOR ALL with USING/WITH CHECK (profile_id =
-- auth.uid()). It asked whether the row was ABOUT you, never whether you had any
-- business in that thread — so any member could POST themselves a thread_members
-- row for any thread id and immediately read every private message in it. A held
-- membership could do it too.
--
-- Members never create membership in the product: threads seat their people
-- through definer functions. The only thing a member does here is mark a thread
-- read, and a column grant keeps them from moving their own seat into someone
-- else's conversation by UPDATE instead.
drop policy if exists "manage own membership" on public.thread_members;

create policy "mark own thread read" on public.thread_members
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "shoreside takes a seat" on public.thread_members
  for insert to authenticated
  with check (public.is_staff());

create policy "staff manage the roster" on public.thread_members
  for delete to authenticated
  using (public.is_staff());

revoke update on public.thread_members from authenticated;
grant update (last_read_at) on public.thread_members to authenticated;

-- The same shape on notifications: "mark word read" granted a whole-row UPDATE,
-- so a member could rewrite the title and body of the club's own words and read
-- the forgery back in their inbox.
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;
