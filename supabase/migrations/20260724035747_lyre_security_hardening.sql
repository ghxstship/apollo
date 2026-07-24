-- Trigger functions must not be callable through the REST RPC surface
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_rsvp_aboard() from public, anon, authenticated;

-- Application funnel: still open to anyone, but reject junk rows at the policy
drop policy "anyone applies" on public.applications;
create policy "anyone applies" on public.applications
  for insert to anon, authenticated
  with check (
    char_length(full_name) between 1 and 120
    and char_length(email) between 5 and 254
    and position('@' in email) > 1
  );
