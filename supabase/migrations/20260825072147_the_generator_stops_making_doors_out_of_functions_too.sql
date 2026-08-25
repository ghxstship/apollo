-- I fixed half of this an hour ago and said so as though it were whole. The
-- default ACL arms THREE object classes, not one:
--
--   tables/views  anon=arwdDxtm, authenticated=arwdDxtm   ← fixed
--   functions     anon=X                                   ← not fixed
--   sequences     anon=rwU                                 ← not fixed
--
-- The proof arrived on its own: fifteen trigger functions created on this
-- project in the last hour all came up with `anon holds EXECUTE`, and the
-- security_report caught every one. A trigger function has no business being
-- callable by anybody — it expects NEW and OLD and a firing context, and
-- calling it directly is at best an error and at worst a definer running with
-- the owner's rights on arguments a stranger chose.
--
-- Two migrations today already had to hand-revoke EXECUTE on exactly one
-- function each, and I wrote both of those revokes without noticing they were
-- instances of a generator rather than accidents. That is the same mistake as
-- fixing a view instead of the default that arms every view.
--
-- Sequences go too. `anon=rwU` means USAGE and UPDATE on every sequence: a
-- stranger can call setval and reset a counter, or burn identifiers out of one.
-- Nothing anonymous needs to touch a sequence in this product.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke usage, update on sequences from anon;

-- And close the fifteen already standing. Nothing here is an RPC the app calls:
-- every one is a trigger function, identified by returning `trigger`, which is
-- a signature PostgREST cannot invoke and no client has any reason to hold.
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format('revoke execute on function %s from anon, authenticated', f.sig);
    n := n + 1;
  end loop;
  raise notice 'closed % trigger function(s)', n;
end $$;
;
