-- Two findings from the first run of security_report(), both about protection
-- that happens to work rather than protection that is stated.
--
-- 1. The logbook policies were created without a role clause, so they land on
--    PUBLIC and anon evaluates them. Today anon is stopped by an accident:
--    is_staff() is not granted to anon, so the policy raises "permission denied
--    for function is_staff" instead of returning no rows. Grant is_staff to anon
--    at any point in the future and member_marks leaks immediately, because its
--    in_directory branch is true for a signed-out reader. The codebase's own
--    convention is 90 policies scoped `to authenticated`; these five were the
--    exception. Scoping them makes anon fail closed by policy, not by grant, and
--    turns a 42501 error into a clean empty result.
--
-- 2. anon holds blanket INSERT/UPDATE/DELETE on every table in public. That is
--    the Supabase default and RLS is the real boundary, so nothing is currently
--    exposed — but it means one mis-written policy is the only thing between an
--    outsider and a write. anon legitimately writes exactly two tables: the
--    application funnel and the crew funnel. The rest are revoked.

-- ===== 1. Scope the logbook policies to authenticated ========================

drop policy if exists "marks readable" on public.marks;
create policy "marks readable" on public.marks
  for select to authenticated using (active or public.is_staff());

drop policy if exists "marks staff writes" on public.marks;
create policy "marks staff writes" on public.marks
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "member marks readable" on public.member_marks;
create policy "member marks readable" on public.member_marks
  for select to authenticated using (
    profile_id = auth.uid()
    or public.is_staff()
    or exists (select 1 from public.profiles p where p.id = profile_id and p.in_directory)
  );

drop policy if exists "contests readable" on public.contests;
create policy "contests readable" on public.contests
  for select to authenticated using (status in ('open', 'settled') or public.is_staff());

drop policy if exists "contests staff writes" on public.contests;
create policy "contests staff writes" on public.contests
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "entries readable" on public.contest_entries;
create policy "entries readable" on public.contest_entries
  for select to authenticated using (
    public.is_staff()
    or profile_id = auth.uid()
    or exists (
      select 1 from public.contests c
      where c.id = contest_id and c.status in ('open', 'settled')
    )
  );

drop policy if exists "enter yourself" on public.contest_entries;
create policy "enter yourself" on public.contest_entries
  for insert to authenticated with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.contests c
      where c.id = contest_id and c.status = 'open' and now() < c.ends_at
    )
  );

drop policy if exists "withdraw yourself" on public.contest_entries;
create policy "withdraw yourself" on public.contest_entries
  for delete to authenticated using (
    profile_id = auth.uid()
    and exists (
      select 1 from public.contests c
      where c.id = contest_id and c.status = 'open'
    )
  );

drop policy if exists "results readable" on public.contest_results;
create policy "results readable" on public.contest_results
  for select to authenticated using (
    public.is_staff()
    or exists (select 1 from public.contests c where c.id = contest_id and c.status = 'settled')
  );

-- ===== 2. Take the write grants off anon =====================================

do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      -- The two public funnels: an outsider must be able to apply for
      -- membership, and to apply to crew.
      and c.relname not in ('applications', 'crew_candidates')
  loop
    execute format('revoke insert, update, delete on public.%I from anon', t.relname);
  end loop;
end;
$$;

-- The funnels keep INSERT and nothing else — an applicant may lodge a form, not
-- revise or withdraw one. RLS still checks the shape of what they send.
revoke update, delete on public.applications from anon;
revoke update, delete on public.crew_candidates from anon;

-- ===== 3. Teach the report about the funnels =================================

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

  -- anon writes the two public funnels, by INSERT only, and nothing else.
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

  -- A policy left on PUBLIC is evaluated for anon too. On a members' table that
  -- is how a signed-out reader ends up inside an is_staff() call.
  return query
  select 'policy_role_scoped',
         (p.tablename || ' · ' || p.policyname)::text,
         p.roles::text <> '{public}'
           or p.tablename in (
             -- Genuinely public reading: the marketing site renders these
             -- signed-out.
             'harbors', 'voyages', 'vessels', 'voyage_vessels', 'voyage_media',
             'dispatch_posts', 'addons', 'membership_plans', 'crew_roles'
           ),
         p.roles::text
  from pg_policies p
  where p.schemaname = 'public';
end;
$$;

revoke execute on function public.security_report() from public, anon;
grant execute on function public.security_report() to authenticated;
