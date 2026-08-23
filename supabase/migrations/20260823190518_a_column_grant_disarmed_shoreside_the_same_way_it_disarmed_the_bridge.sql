-- `grant update (last_read_at)` was meant to stop a member editing a thread
-- roster. Staff are `authenticated` too, so it stopped them as well: the
-- Shoreside reply box opens with an upsert on thread_members, and Postgres
-- refuses ON CONFLICT DO UPDATE at plan time without UPDATE on every column
-- named. The screen says "Replies work the moment a thread arrives." They do
-- not, and would not have on the first one.
--
-- This is the third time a column grant has disarmed staff — media approval,
-- gangway check-in, and now Shoreside. The rule is settled: the grant belongs
-- to the role, so the restriction has to be a trigger that knows who is asking.
grant update on public.thread_members to authenticated;

create or replace function public.guard_thread_seat()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  -- A member may mark their own seat read. Nothing else about a seat is theirs.
  new.thread_id  := old.thread_id;
  new.profile_id := old.profile_id;
  new.joined_at  := old.joined_at;
  return new;
end;
$$;

revoke execute on function public.guard_thread_seat() from public, anon, authenticated;

drop trigger if exists guard_thread_seat on public.thread_members;
create trigger guard_thread_seat
  before update on public.thread_members
  for each row execute function public.guard_thread_seat();

-- The UPDATE policy only ever matched a member's own seat, so even with the
-- grant restored the Bridge's upsert would have found no row to update.
drop policy if exists "shoreside keeps its seat" on public.thread_members;
create policy "shoreside keeps its seat" on public.thread_members
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- thread_members is sealed to anon by policy; the grant was never needed.
revoke select on public.thread_members from anon;;
