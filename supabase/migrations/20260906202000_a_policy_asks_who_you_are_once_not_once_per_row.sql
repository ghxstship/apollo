-- Eighty-nine policies asked who the caller was once for every row they looked
-- at.
--
-- A bare auth.uid() in a policy is a volatile function call the planner cannot
-- hoist, so it runs per row: a member reading two hundred ledger lines calls it
-- two hundred times, and a staff screen scanning a large table calls it once
-- per row scanned. Wrapping it as (select auth.uid()) turns it into an InitPlan
-- — evaluated once, before the scan — and changes nothing about what the policy
-- means.
--
-- This is the whole of the fix and it is entirely mechanical, which is why it
-- is done by the database to itself rather than by hand across eighty-nine
-- policies in forty migrations. Each policy's expression is read back out with
-- pg_get_expr (which is what pg_policies.qual is), rewritten, and put back with
-- ALTER POLICY. The semantics are Postgres's own rendering of an expression it
-- parsed; the only edit is the wrapping.
--
-- THE PLACEHOLDER DANCE. Postgres's regex has no lookbehind, so "replace
-- auth.uid() unless it already sits inside a select" cannot be written
-- directly. Instead the already-wrapped occurrences are parked under a marker
-- first, the bare ones are wrapped, and the marker is put back. Without it a
-- policy holding one of each would come out with (select (select auth.uid()))
-- — harmless, and the sort of thing that makes the next reader wonder what was
-- meant.
--
-- Twelve policies were already correct and are left alone by the same test that
-- finds the other eighty-nine, so this file is safe to run twice.

do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_sql text;
  n integer := 0;
  bare constant text := 'auth\.(uid|role|jwt)\(\)';
  wrapped constant text := '\(\s*select\s+auth\.(uid|role|jwt)\(\)[^)]*\)';
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and ( (coalesce(qual, '')       ~* bare and coalesce(qual, '')       !~* wrapped)
          or (coalesce(with_check, '') ~* bare and coalesce(with_check, '') !~* wrapped) )
  loop
    v_qual := r.qual;
    v_check := r.with_check;

    if v_qual is not null then
      v_qual := regexp_replace(v_qual, wrapped, '<<KEPT>>', 'gi');
      v_qual := regexp_replace(v_qual, '(' || bare || ')', '(select \1)', 'gi');
      v_qual := replace(v_qual, '<<KEPT>>', '(select auth.uid())');
    end if;
    if v_check is not null then
      v_check := regexp_replace(v_check, wrapped, '<<KEPT>>', 'gi');
      v_check := regexp_replace(v_check, '(' || bare || ')', '(select \1)', 'gi');
      v_check := replace(v_check, '<<KEPT>>', '(select auth.uid())');
    end if;

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_qual is not null then
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;
    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
    n := n + 1;
  end loop;

  raise notice 'rewrote % policies to evaluate the caller once', n;

  /* And prove it took, in the same transaction that did it. A migration that
     silently rewrote nothing would be indistinguishable from one that worked. */
  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and ( (coalesce(qual, '')       ~* bare and coalesce(qual, '')       !~* wrapped)
          or (coalesce(with_check, '') ~* bare and coalesce(with_check, '') !~* wrapped) )
  ) then
    raise exception 'a policy still evaluates the caller per row after the rewrite — look at it by hand';
  end if;
end $$;

-- Deliberately NOT touched in this pass, with the reasoning written down so
-- nobody has to rediscover it:
--
--   33 "unused" indexes. The database has almost no production traffic — 17
--   members, of whom 13 are fixtures — so "this index has never been used"
--   means "not yet", not "never". Dropping them would be acting on a statistic
--   that has not had the chance to be true. Revisit after a season of real
--   members, when the number means something.
--
--   69 multiple-permissive-policy warnings. Two permissive policies for one
--   role and action are both evaluated, which costs a little; merging them
--   changes what the policy MEANS, and the pair is usually "the public rule"
--   plus "the staff rule", which read far more clearly apart than they would
--   welded into one OR. A performance note is not a reason to make an access
--   rule harder to read.

notify pgrst, 'reload schema';
