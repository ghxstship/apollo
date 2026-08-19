-- The security posture as a tested invariant rather than a thing someone
-- remembers to review. security_report() walks the catalog and returns one row
-- per check; the e2e suite calls it as staff and fails the build on any row that
-- is not ok. New tables, views and functions are therefore held to the same line
-- as the ones that exist today, without anybody having to notice.
--
-- Staff-only, because it is a map of the attack surface.

create or replace function public.security_report()
returns table (
  check_name text,
  subject    text,
  ok         boolean,
  detail     text
)
language plpgsql stable security definer set search_path = public, pg_catalog
as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  -- 1. Every base table in public carries RLS.
  return query
  select 'rls_enabled', c.relname::text, c.relrowsecurity,
         case when c.relrowsecurity then 'on' else 'RLS IS OFF' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';

  -- 2. RLS with no policy denies everything, which is usually an oversight
  --    rather than an intent.
  return query
  select 'has_policy', c.relname::text,
         (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname) > 0,
         (select count(*)::text || ' policies' from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;

  -- 3. A SECURITY DEFINER function without a pinned search_path can be steered
  --    into calling an attacker's function of the same name.
  return query
  select 'definer_search_path', p.proname::text,
         coalesce(array_to_string(p.proconfig, ',') like '%search_path%', false),
         coalesce(array_to_string(p.proconfig, ','), 'NO search_path')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef;

  -- 4. Trigger functions are reachable only as triggers. Postgres refuses a
  --    direct call anyway, so a grant here is untidy rather than dangerous —
  --    but untidy is how the dangerous one gets missed.
  return query
  select 'trigger_fn_not_granted', p.proname::text,
         not (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute')),
         case when has_function_privilege('anon', p.oid, 'execute')
              then 'anon holds EXECUTE' else 'authenticated holds EXECUTE' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prorettype = 'trigger'::regtype;

  -- 5. A view without security_invoker runs as its owner and sees past RLS.
  --    voyage_capacity is the one deliberate exception: the public site prints
  --    "N passes left", which is an aggregate over rsvps that anon cannot read
  --    row by row. It exposes counts only, never a member.
  return query
  select 'view_security_invoker', c.relname::text,
         coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'off') = 'on'
           or c.relname = 'voyage_capacity',
         coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'NOT SET')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v';

  -- 6. The anonymous role reads some things. It writes nothing, anywhere.
  return query
  select 'anon_cannot_write', c.relname::text,
         not (has_table_privilege('anon', c.oid, 'insert')
              or has_table_privilege('anon', c.oid, 'update')
              or has_table_privilege('anon', c.oid, 'delete')),
         concat_ws(' ',
           case when has_table_privilege('anon', c.oid, 'insert') then 'INSERT' end,
           case when has_table_privilege('anon', c.oid, 'update') then 'UPDATE' end,
           case when has_table_privilege('anon', c.oid, 'delete') then 'DELETE' end)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    -- applications is the public funnel: an outsider must be able to apply.
    and c.relname <> 'applications';
end;
$$;

revoke execute on function public.security_report() from public, anon;
grant execute on function public.security_report() to authenticated;

-- Finding from the first run of the report: the trigger wrapper added with the
-- Marks work kept the default PUBLIC EXECUTE that its sibling triggers had
-- revoked. Harmless in isolation — Postgres will not call a trigger function
-- directly — but it is the inconsistency that hides the next one.
revoke execute on function public.confer_marks_on_completion() from public, anon, authenticated;
