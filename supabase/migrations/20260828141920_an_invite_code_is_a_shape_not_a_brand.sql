-- Every member's "invite a friend" has been failing since the rebrand, 100% of
-- the time, with a raw 42501. The mint was changed to UN- and the RLS policy
-- that admits the row still demanded the retired prefix:
--
--   code ~ '^SYR-[A-Z0-9]{4}-[A-Z0-9]{4}$'
--
-- Every purge check scanned table DATA and pg_proc bodies for the literal
-- 'SYR-'. A regex reading '^SYR-[A-Z0-9]{4}…' contains no such literal and
-- lives in pg_policy, which nothing scanned — so three sweeps each reported
-- clean over a policy that had locked members out of a feature.
--
-- The policy now validates the SHAPE and not the brand. Every other clause is
-- preserved exactly; a rebrand should not be able to take a feature away, and
-- the next one will not.
drop policy if exists "mint own invite" on public.invites;
create policy "mint own invite" on public.invites
  for insert to authenticated
  with check (
    inviter_id = auth.uid()
    and is_active()
    and coalesce(uses, 0) = 0
    and coalesce(max_uses, 3) >= 1
    and coalesce(max_uses, 3) <= 3
    and code ~ '^[A-Z]{2,4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'
  );

-- THE CLASS, not the instance. Policies, CHECK constraints, view definitions
-- and index predicates are code too, and all four were unscanned.
do $$
declare r record; found text := '';
begin
  for r in
    select 'policy ' || polrelid::regclass || '.' || polname as what,
           coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
           coalesce(pg_get_expr(polwithcheck, polrelid), '') as body
      from pg_policy
    union all
    select 'constraint ' || conrelid::regclass || '.' || conname, pg_get_constraintdef(oid)
      from pg_constraint where contype = 'c'
    union all
    select 'view ' || c.relname, pg_get_viewdef(c.oid, true)
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v','m')
    union all
    select 'index ' || i.indexrelid::regclass, pg_get_expr(i.indpred, i.indrelid)
      from pg_index i join pg_class c on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and i.indpred is not null
  loop
    if r.body ~* '(\m(syrius|lyre)\M)' or r.body ~ '\m(SYR|LYR|LYRE|LS)-' then
      found := found || format(E'\n    %s', r.what);
    end if;
  end loop;
  if found <> '' then
    raise exception 'a retired brand is still in the SCHEMA:%', found;
  end if;
end $$;;
