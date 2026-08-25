-- UNDOING A MISTAKE OF MINE, IN FULL.
--
-- Fixing the default-privilege hole, I revoked write grants from every view and
-- then — to avoid breaking member writes — ran a loop granting INSERT, UPDATE
-- and DELETE on EVERY table to `authenticated`. That was careless in a specific
-- way: this schema protects a number of tables by the ABSENCE of a grant rather
-- than by a policy. RLS denies by default when no policy matches, so most of
-- them held anyway — but two did not, and the e2e suite caught both within
-- minutes: a member could rewrite a notification, and the gate on who may open
-- a direct thread stopped refusing.
--
-- Eighteen tables ended up holding DELETE/INSERT/UPDATE against a SELECT-only
-- policy set. Among them: signatures, which is the legal record this product
-- refuses to let anyone edit; fathoms_ledger, which is append-only by design;
-- invoices and payment_methods; and the three outboxes that reach real
-- people's inboxes and phones.
--
-- The principle I should have applied the first time: A GRANT EXISTS ONLY WHERE
-- A POLICY COULD USE IT. If no policy names a command, nothing may be granted
-- for that command — the grant is dead weight at best and a second door at
-- worst, and it removes the belt from an arrangement that was deliberately
-- wearing both.
--
-- This reconstructs that posture rather than restoring a snapshot, because
-- there is no snapshot: I did not record the grants before overwriting them.
-- That is the part of this worth remembering.
do $$
declare t record; cmd record; n int := 0;
begin
  for t in
    select c.oid, c.relname
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
  loop
    for cmd in
      select * from (values ('INSERT','a'), ('UPDATE','w'), ('DELETE','d')) as v(priv, code)
    loop
      /* '*' is a policy declared FOR ALL and covers every command. */
      if not exists (
        select 1 from pg_policy p
        where p.polrelid = t.oid and p.polcmd::text in (cmd.code, '*')
      ) then
        execute format('revoke %s on public.%I from anon, authenticated', cmd.priv, t.relname);
        n := n + 1;
      end if;
    end loop;
  end loop;
  raise notice 'removed % grant(s) no policy could have used', n;
end $$;
;
