-- 20260906037000_a_policy_asks_the_session_once_not_once_a_row.sql wrapped the
-- calls that could be hoisted and said plainly what it could not fix: a
-- definer handed a COLUMN. is_door(episode_id) genuinely differs per row, so
-- no amount of (select …) moves it out of the loop; the planner has to run a
-- definer, and inside it a query, once for every candidate row the statement
-- considers. That migration rewrote the one policy it had measured — the
-- door's manifest on passes — and left the rest to be found.
--
-- They have now been found. Nine policies in the corpus hand a column to a
-- project function. Eight of them are rewritten here as a set lookup: ask the
-- definer once for the identifiers this member is entitled to, and test the
-- row against that set. An uncorrelated IN (subquery) is hashed once for the
-- statement, which is exactly the hoist the wrapped form buys for a call that
-- takes no argument.
--
-- Measured on a replayed corpus at club scale — 10 000 members, 2 000 threads,
-- 6 000 thread memberships, 200 000 messages, 2 000 tables, 12 000 seats,
-- 10 000 passes — as a member who is in three of the two thousand threads and
-- seated at four of the two thousand tables:
--
--   messages, newest fifty      1 543.997 ms  1 202 370 buf  ->  10.157 ms  2 676 buf
--   the thread roster               45.421 ms     36 041 buf  ->   0.441 ms    107 buf
--   the thread list                 22.734 ms     18 016 buf  ->   0.281 ms     28 buf
--   the seats a member may see     109.155 ms     61 118 buf  ->   1.502 ms    766 buf
--   the door stamps its episode                    1 390 buf  ->   3.770 ms  1 204 buf
--
-- The messages figure is the one that matters. in_thread() per row over
-- 200 000 rows is 200 000 index lookups inside 200 000 definer calls, and it
-- is on the read a member does every time they open their post. It was a
-- second and a half.
--
-- The door is the honest exception. Its episode had twenty passes on it, so
-- the per-row cost had twenty rows to be paid on and the rewrite moves 1 390
-- buffers to 1 204 and nothing anyone would notice. It is rewritten anyway:
-- the shape is the one that does not scale, the manifest policy beside it was
-- already rewritten this way in 20260906037000, and two policies on the same
-- table that mean the same thing should not be spelt two different ways.
--
-- Every rewrite below was checked for visibility rather than trusted. Seven
-- personas — staff, a door holder, a member in three threads, a member in
-- none, a seated member, a pass holder with no seat, a host with a guest —
-- against nine probes each: the full visible row set of threads, messages,
-- thread_members, table_seats, passes and pass_guests by SELECT, and the row
-- set an UPDATE may touch on passes, pass_guests and thread_members. Sixty-
-- three md5s over the ordered identifiers, before and after. All sixty-three
-- identical.
--
-- One is deliberately NOT rewritten, and the reason is visibility rather than
-- speed. `erase a guest who never signed` on pass_guests asks
-- guest_has_signed(id), which is a definer precisely because a host cannot
-- read the signatures table directly for a guest seated without a pass — the
-- policy on signatures joins through passes and finds nothing for that guest.
-- Inline the lookup and the host stops seeing the signature, NOT
-- guest_has_signed turns true, and a guest who HAS signed becomes deletable.
-- That is a widening, not an optimisation. It also does not need fixing: a
-- DELETE names the rows it deletes, so the call runs once or twice, never
-- once per table row. It stays as it is, with this paragraph as the record.

-- ── the sets ────────────────────────────────────────────────────────────────
-- Two definers that return identifiers rather than a yes or no. They are
-- definers for the same reason the predicates they replace were: the policy on
-- thread_members is the policy that would have to be consulted to answer the
-- question, and a policy that reads its own table through RLS is an infinite
-- recursion, not a query. Same grants as the predicates they stand beside:
-- nobody's to call but a signed-in member and the service role.
create or replace function public.threads_i_am_in()
returns setof uuid language sql stable security definer set search_path = public as $$
  select tm.thread_id from public.thread_members tm where tm.profile_id = auth.uid();
$$;
revoke execute on function public.threads_i_am_in() from public, anon;
grant execute on function public.threads_i_am_in() to authenticated;
comment on function public.threads_i_am_in() is
  'The threads this member sits in, asked once for a statement instead of once for a row.';

create or replace function public.tables_i_am_seated_at()
returns setof uuid language sql stable security definer set search_path = public as $$
  select ts.table_id
    from public.table_seats ts
   where ts.profile_id = auth.uid()
     and ts.state = 'confirmed'
     and public.has_a_pass_for_the_table(ts.table_id);
$$;
revoke execute on function public.tables_i_am_seated_at() from public, anon;
grant execute on function public.tables_i_am_seated_at() to authenticated;
comment on function public.tables_i_am_seated_at() is
  'The tables this member is confirmed at and holds a pass for — at_table(), asked as a set.';

-- ── the door ────────────────────────────────────────────────────────────────
-- is_door(p) is `is_staff() or a live grant for p`, and passes.episode_id is
-- NOT NULL, so the argumentless branch of that function cannot be reached from
-- here. The set form below is therefore the same predicate, term for term, and
-- is the shape the manifest policy already took in 20260906037000.
alter policy "the door stamps arrivals" on public.passes
  using (
    (select public.is_staff())
    or episode_id in (
      select g.episode_id from public.door_grants g
       where g.profile_id = (select auth.uid()) and g.expires_at > now()
    )
  )
  with check (
    (select public.is_staff())
    or episode_id in (
      select g.episode_id from public.door_grants g
       where g.profile_id = (select auth.uid()) and g.expires_at > now()
    )
  );

-- The two guest policies keep their outer EXISTS on passes exactly as it was —
-- a guest row with no pass is still invisible to the door, staff included,
-- which is what the policy said before and what `host manages own guests`
-- already covers for staff. Only is_door(r.episode_id) is replaced.
alter policy "the door reads its guests" on public.pass_guests
  using (
    exists (
      select 1 from public.passes r
       where r.id = pass_guests.rsvp_id
         and ((select public.is_staff())
              or r.episode_id in (
                select g.episode_id from public.door_grants g
                 where g.profile_id = (select auth.uid()) and g.expires_at > now()))
    )
  );

alter policy "the door stamps guests" on public.pass_guests
  using (
    exists (
      select 1 from public.passes r
       where r.id = pass_guests.rsvp_id
         and ((select public.is_staff())
              or r.episode_id in (
                select g.episode_id from public.door_grants g
                 where g.profile_id = (select auth.uid()) and g.expires_at > now()))
    )
  )
  with check (
    exists (
      select 1 from public.passes r
       where r.id = pass_guests.rsvp_id
         and ((select public.is_staff())
              or r.episode_id in (
                select g.episode_id from public.door_grants g
                 where g.profile_id = (select auth.uid()) and g.expires_at > now()))
    )
  );

-- ── the post ────────────────────────────────────────────────────────────────
-- in_thread(t) is `exists a membership row for t and me`; membership of the
-- set of my threads is the same statement read the other way round. Both
-- thread_id columns are NOT NULL, so there is no null to argue about.
alter policy "read own threads" on public.threads
  using (id in (select public.threads_i_am_in()) or (select public.is_staff()));

alter policy "read thread messages" on public.messages
  using (thread_id in (select public.threads_i_am_in()) or (select public.is_staff()));

alter policy "read thread roster" on public.thread_members
  using (thread_id in (select public.threads_i_am_in()) or (select public.is_staff()));

-- And one bare call that the measurement dragged in. `staff write threads` is
-- FOR ALL, so it is ORed into every SELECT on threads as well, and with
-- is_staff() written bare it put a definer call and a profiles lookup back on
-- every one of the two thousand rows: after `read own threads` was rewritten
-- the thread list was still 11.7 ms and 6 091 buffers, of which 6 088 were
-- this policy. Wrapping it is the same hoist the migration before this one
-- made everywhere it measured, and it is what makes the rewrite above show up.
alter policy "staff write threads" on public.threads
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- A WITH CHECK is only ever evaluated against the rows being written, so this
-- one was never the expensive shape. It is rewritten anyway: the same policy
-- saying the same thing two different ways is how the next person learns the
-- wrong one. The closed-thread test stays a correlated EXISTS — it is on the
-- row being inserted, and it is a primary-key lookup.
alter policy "write to own threads" on public.messages
  with check (
    author_id = (select auth.uid())
    and thread_id in (select public.threads_i_am_in())
    and ((select public.is_staff()) or (select public.is_active()))
    and ((select public.is_staff()) or not exists (
      select 1 from public.threads t
       where t.id = messages.thread_id and t.closed_at is not null))
  );

-- ── the table ───────────────────────────────────────────────────────────────
-- at_table(t) is two conditions joined by AND — a confirmed seat of mine at t,
-- and a pass of mine for the episode t belongs to. Neither is a property of
-- the row being judged; both are properties of t. So the whole conjunction
-- moves inside the set function and the policy tests membership.
alter policy "seatmates and staff see the table" on public.table_seats
  using (
    (select public.is_staff())
    or profile_id = (select auth.uid())
    or table_id in (select public.tables_i_am_seated_at())
  );
