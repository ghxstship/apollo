-- Three findings from the suite's first pass over the dating and episodes
-- tables — two of them exactly the classes this schema's invariants exist for.
--
-- 1. "seatmates see the table" queried table_seats inside its own policy:
--    infinite recursion (42P17), which also took down pick INSERTs whose
--    policies read the same table. The membership test moves to a definer
--    helper, the same pattern in_thread() uses for messaging.
-- 2. episodes' read policy sat on PUBLIC and called is_staff(), which anon
--    cannot execute — the public-gallery bug, rebuilt six days later. Split by
--    role: anon reads the published branch, no function call.
-- 3. cabins joins the deliberate public-read whitelist in security_report.

create or replace function public.at_table(p_table uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.table_seats
    where table_id = p_table and profile_id = auth.uid()
  );
$$;
revoke execute on function public.at_table(uuid) from public, anon;
grant execute on function public.at_table(uuid) to authenticated;

drop policy if exists "seatmates and staff see the table" on public.table_seats;
create policy "seatmates and staff see the table" on public.table_seats
  for select to authenticated using (
    public.is_staff() or profile_id = auth.uid() or public.at_table(table_id)
  );

drop policy if exists "published episodes are public" on public.episodes;
create policy "published episodes are anon-readable" on public.episodes
  for select to anon using (state = 'published');
create policy "cast and crew read episodes" on public.episodes
  for select to authenticated using (state = 'published' or public.is_staff());

drop policy if exists "cabins are public" on public.cabins;
create policy "cabins are anon-readable" on public.cabins
  for select to anon using (active);
create policy "cast and crew read cabins" on public.cabins
  for select to authenticated using (active or public.is_staff());

-- Teach the report the two new deliberately-public tables.
-- (security_report's policy_role_scoped whitelist is name-based.)
-- Patch just the whitelist inside security_report by re-creating the one check
-- is impossible piecemeal; recreate the full function with the two names added.

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
             'dispatch_posts', 'addons', 'membership_plans', 'crew_roles',
             -- Syrius additions, deliberately public: the booking page shows
             -- the cabin plan; episodes are the public face of the show.
             'cabins', 'episodes'
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
