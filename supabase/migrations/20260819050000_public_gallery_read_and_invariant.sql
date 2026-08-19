-- The public gallery could not read its own photographs.
--
-- "approved frames are public" sat on PUBLIC with the qual
--   approved OR uploaded_by = auth.uid() OR is_staff()
-- and is_staff() is not granted to anon. Postgres checks EXECUTE on every
-- function a query references before any OR short-circuits, so a signed-out
-- reader got 42501 rather than the approved rows. The gallery reads with the
-- anon client by design, and fails soft on error — so with zero approved frames
-- in the table the breakage was invisible. It would have surfaced the day
-- somebody approved the first photograph.
--
-- Split by role: anon gets the branch that needs no function call, authenticated
-- keeps the full expression.

drop policy if exists "approved frames are public" on public.voyage_media;

create policy "approved frames are public" on public.voyage_media
  for select to anon using (approved);

create policy "members see approved, own, and staff see all" on public.voyage_media
  for select to authenticated using (
    approved or uploaded_by = auth.uid() or public.is_staff()
  );

-- Hold the class shut. A policy that anon evaluates may not call is_staff(),
-- because anon has no EXECUTE on it and the whole query dies rather than
-- returning no rows. This is the check that would have caught the above.
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

  return query
  select 'rls_enabled', c.relname::text, c.relrowsecurity,
         case when c.relrowsecurity then 'on' else 'RLS IS OFF' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';

  return query
  select 'has_policy', c.relname::text,
         (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname) > 0,
         (select count(*)::text || ' policies' from pg_policies p
           where p.schemaname = 'public' and p.tablename = c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;

  return query
  select 'definer_search_path', p.proname::text,
         coalesce(array_to_string(p.proconfig, ',') like '%search_path%', false),
         coalesce(array_to_string(p.proconfig, ','), 'NO search_path')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef;

  return query
  select 'trigger_fn_not_granted', p.proname::text,
         not (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute')),
         case when has_function_privilege('anon', p.oid, 'execute')
              then 'anon holds EXECUTE' else 'authenticated holds EXECUTE' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prorettype = 'trigger'::regtype;

  return query
  select 'view_security_invoker', c.relname::text,
         coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'off') = 'on'
           or c.relname = 'voyage_capacity',
         coalesce((select option_value from pg_options_to_table(c.reloptions)
                   where option_name = 'security_invoker'), 'NOT SET')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v';

  return query
  select 'anon_write_grants', c.relname::text,
         case
           when c.relname in ('applications', 'crew_candidates')
             then has_table_privilege('anon', c.oid, 'insert')
                  and not has_table_privilege('anon', c.oid, 'update')
                  and not has_table_privilege('anon', c.oid, 'delete')
           else not (has_table_privilege('anon', c.oid, 'insert')
                     or has_table_privilege('anon', c.oid, 'update')
                     or has_table_privilege('anon', c.oid, 'delete'))
         end,
         coalesce(nullif(concat_ws(' ',
           case when has_table_privilege('anon', c.oid, 'insert') then 'INSERT' end,
           case when has_table_privilege('anon', c.oid, 'update') then 'UPDATE' end,
           case when has_table_privilege('anon', c.oid, 'delete') then 'DELETE' end), ''), 'none')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';

  return query
  select 'policy_role_scoped',
         (p.tablename || ' · ' || p.policyname)::text,
         p.roles::text <> '{public}'
           or p.tablename in (
             'harbors', 'voyages', 'vessels', 'voyage_vessels',
             'dispatch_posts', 'addons', 'membership_plans', 'crew_roles'
           ),
         p.roles::text
  from pg_policies p
  where p.schemaname = 'public';

  -- A policy anon can reach must not call a function anon cannot execute.
  -- Postgres resolves EXECUTE on every referenced function up front, so the
  -- query errors instead of returning no rows — protection by accident, and a
  -- broken read for whoever legitimately needed the public branch.
  return query
  select 'anon_policy_calls_only_granted_fns',
         (p.tablename || ' · ' || p.policyname)::text,
         not (
           (p.roles::text = '{public}' or p.roles::text like '%anon%')
           and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%is_staff%'
         ),
         'reachable by anon and calls is_staff()'
  from pg_policies p
  where p.schemaname = 'public';
end;
$$;

revoke execute on function public.security_report() from public, anon;
grant execute on function public.security_report() to authenticated;
