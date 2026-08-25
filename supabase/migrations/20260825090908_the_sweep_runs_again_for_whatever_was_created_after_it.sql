-- 20260825072304 revoked EXECUTE from PUBLIC on every trigger function, but it
-- was a one-shot loop over the functions that existed at that moment.
-- an_anchor_is_never_extended was created five minutes later, at 072843, and so
-- kept the default grant. Someone locked it down directly in the live database
-- and recorded no migration — which means live was correct and a rebuild from
-- the files would not have been. That is the difference between a repository
-- that describes the product and one that merely remembers some of it.
--
-- Postgres grants EXECUTE on functions to PUBLIC by default, so this is not a
-- one-time cleanup: it recurs for every trigger function anyone adds. Running
-- the sweep again fixes today; the invariant below is what makes it stay fixed,
-- because it fails loudly the next time instead of waiting to be noticed.
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prorettype = 'trigger'::regtype
       and (has_function_privilege('public', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    n := n + 1;
  end loop;
  raise notice 'closed % trigger function(s)', n;
end $$;

-- A trigger function is called by the trigger, never by a client. Any EXECUTE
-- held by PUBLIC, anon or authenticated is a way to run a SECURITY DEFINER body
-- with a hand-built NEW record, outside the table it is supposed to guard.
do $$
declare leaked text;
begin
  select string_agg(p.oid::regprocedure::text, ', ')
    into leaked
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('public', p.oid, 'execute')
       or has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  if leaked is not null then
    raise exception 'trigger functions still callable by a client: %', leaked;
  end if;
end $$;;
