-- My previous migration revoked EXECUTE from `anon` and `authenticated` and
-- the functions stayed callable, because that is not where the grant comes
-- from. POSTGRES GRANTS EXECUTE ON EVERY FUNCTION TO `PUBLIC` BY DEFAULT, and
-- `anon` inherits it as a member of PUBLIC. Revoking from the role while PUBLIC
-- still holds it is a no-op that reads exactly like a fix — the migration
-- applied, the wording was right, and has_function_privilege('anon', …) kept
-- returning true.
--
-- The security_report is what caught it. I had already declared this closed on
-- the strength of the migration succeeding, which is the same error as trusting
-- a green gate: applied is not the same as effective.
--
-- Trigger functions are the sharp case. They expect NEW, OLD and a firing
-- context, so calling one directly is at best an error — and several here are
-- SECURITY DEFINER, which means a stranger's arguments would run with the
-- owner's rights. Eleven were reachable.
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    n := n + 1;
  end loop;
  raise notice 'closed % trigger function(s)', n;
end $$;

-- And the generator, for real this time. PUBLIC is the grantee that matters.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
;
