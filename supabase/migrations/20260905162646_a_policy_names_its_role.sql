-- The schema invariant policy_role_scoped: every policy names the role it is
-- for. The eight added today were created for PUBLIC by default; same rules,
-- scoped to authenticated.
drop policy if exists "a member archives what they have read" on public.notifications;
create policy "a member archives what they have read" on public.notifications
  for delete to authenticated using (profile_id = auth.uid() and read);
drop policy if exists "the Bridge strikes a word" on public.notifications;
create policy "the Bridge strikes a word" on public.notifications
  for delete to authenticated using (public.is_staff());

drop policy if exists "the Bridge works the outbox" on public.email_outbox;
create policy "the Bridge works the outbox" on public.email_outbox for update to authenticated using (public.is_staff()) with check (public.is_staff() and status in ('pending', 'skipped', 'failed'));
drop policy if exists "the Bridge strikes a letter" on public.email_outbox;
create policy "the Bridge strikes a letter" on public.email_outbox for delete to authenticated using (public.is_staff() and status <> 'sending');
drop policy if exists "the Bridge works the outbox" on public.sms_outbox;
create policy "the Bridge works the outbox" on public.sms_outbox for update to authenticated using (public.is_staff()) with check (public.is_staff() and status in ('pending', 'skipped', 'failed'));
drop policy if exists "the Bridge strikes a text" on public.sms_outbox;
create policy "the Bridge strikes a text" on public.sms_outbox for delete to authenticated using (public.is_staff() and status <> 'sending');
drop policy if exists "the Bridge works the outbox" on public.push_outbox;
create policy "the Bridge works the outbox" on public.push_outbox for update to authenticated using (public.is_staff()) with check (public.is_staff() and status in ('pending', 'skipped', 'failed'));
drop policy if exists "the Bridge strikes a push" on public.push_outbox;
create policy "the Bridge strikes a push" on public.push_outbox for delete to authenticated using (public.is_staff() and status <> 'sending');;
