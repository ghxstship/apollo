/* issue_member_qr() raised 42702 on every call and never minted anything.

   `returns table (token uuid, expires_at timestamptz)` declares two OUT
   parameters with exactly the names of two columns on the table the body then
   sweeps, so `where expires_at <= now()` could mean the column or the output
   variable and plpgsql refuses to guess. The RETURNING clause was qualified;
   the DELETE was not, and the DELETE runs first.

   Worth naming because of how it failed: the member card would have rendered
   the empty-credential placeholder and a "New code" button that never worked,
   with the error only in a server log. The gate that caught it was the e2e
   check asserting the token CHANGES between two mints — a check that asserted
   "a credential was returned" would have failed the same way, but a check that
   asserted "the RPC exists" would have passed. */
create or replace function public.issue_member_qr()
returns table (token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_token uuid;
  v_until timestamptz;
begin
  if v_uid is null then raise exception 'sign in first'; end if;

  /* Aliased, so every column reference below names the table rather than this
     function's own output. Lazy sweep rather than scheduled: a rule that needs
     a cron to be true is false whenever the cron is down. */
  delete from public.member_qr_tokens t
   where t.profile_id = v_uid and t.expires_at <= now() - interval '5 minutes';

  v_until := now() + interval '60 seconds';
  insert into public.member_qr_tokens (profile_id, expires_at)
  values (v_uid, v_until)
  returning member_qr_tokens.token into v_token;

  return query select v_token, v_until;
end;
$$;

revoke all on function public.issue_member_qr() from public, anon;
grant execute on function public.issue_member_qr() to authenticated;

notify pgrst, 'reload schema';
;
