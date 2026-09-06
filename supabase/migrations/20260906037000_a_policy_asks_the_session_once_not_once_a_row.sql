-- MEASURED FIRST, because 97 policies is a lot of edits to make on a hunch.
--
-- Ninety-seven policies call auth.uid() bare, none wrapped. auth.uid() is a SQL
-- function the planner inlines, so bare it becomes a current_setting() plus a
-- jsonb parse per candidate row; wrapped as (select auth.uid()) it becomes an
-- InitPlan evaluated once. is_staff() is worse and was not on the reported
-- list: SECURITY DEFINER, so it cannot be inlined, and being a no-argument
-- STABLE function Postgres still calls it once per row — a definer call and a
-- profiles lookup for every row considered.
--
-- On passes, the hot table, a member reading their own passes, ordered and
-- limited, exactly as the app asks:
--
--   60 000 passes    bare + door policy       2 282 ms   361 226 buffers
--                    wrapped + door policy    2 012 ms   181 262 buffers
--                    bare, no door policy       272 ms   181 123 buffers
--                    wrapped, no door policy      3.1 ms   1 159 buffers
--
--      48 passes     bare                       3.75 ms
--   (live, today)    wrapped                    3.34 ms
--
-- And on account_ledger, where the same pattern is worse because the table is
-- bigger. A member reading their own ledger WITHOUT naming profile_id — which
-- is what any read that leans on the policy to scope it does:
--
--   250 000 lines    bare                     1 055 ms   746 350 buffers
--                    wrapped                     10.2 ms   3 843 buffers
--
-- /account names profile_id explicitly and so is not on that path today. The
-- policy is what would have to hold if it ever stopped.
--
-- So: at the size this database actually is, the wrap buys four tenths of a
-- millisecond and ninety-seven edits are not worth making. At club scale it is
-- three orders of magnitude — and the larger half of it is not auth.uid() at
-- all, it is is_door(episode_id), which takes a per-row argument and therefore
-- cannot be hoisted no matter how it is wrapped. Two seconds of the 2.28 are
-- that one function.
--
-- This migration does the two tables where the measurement says it matters and
-- rewrites the door policy so the grant is looked up once instead of asked per
-- row. The other ninety-odd policies are left alone deliberately: they are on
-- tables with tens of rows, the edit is not free to review, and a policy
-- rewritten without a measurement behind it is how a policy gets rewritten
-- wrong.

-- The door holds a set of episodes, so ask for the set once. door_grants
-- already lets a member read their own grants, so this needs no new definer,
-- and is_staff is kept because the function it replaces returned true for
-- staff — even though the other SELECT policy on passes already says so.
drop policy if exists "the door reads its manifest" on public.passes;
create policy "the door reads its manifest" on public.passes
  for select to authenticated
  using (
    (select public.is_staff())
    or episode_id in (
      select g.episode_id from public.door_grants g
       where g.profile_id = (select auth.uid()) and g.expires_at > now()
    )
  );

alter policy "own passes or staff" on public.passes
  using ((profile_id = (select auth.uid())) or (select public.is_staff()));
alter policy "own rsvp delete" on public.passes
  using (profile_id = (select auth.uid()));
alter policy "own rsvp update" on public.passes
  using (profile_id = (select auth.uid()));

alter policy "own or staff ledger" on public.account_ledger
  using ((profile_id = (select auth.uid())) or (select public.is_staff()));
