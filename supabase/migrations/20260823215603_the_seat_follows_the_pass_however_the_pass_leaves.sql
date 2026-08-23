-- crew_seat_follows_the_pass fired on DELETE OR UPDATE OF status. A transfer
-- changes profile_id and never touches status, so after handing a pass on the
-- OLD holder kept a confirmed table seat AND full crew-thread membership —
-- verified reading and posting into the crew thread of a sailing they no longer
-- had a pass for. The ghost seat also counted against the table's capacity, so
-- the new holder could not confirm.
--
-- And the condition was `old.status = 'aboard'` with no test on the new value,
-- so re-writing 'aboard' over 'aboard' — a no-op — silently deleted the
-- member's confirmed table seat. The crew seat survived only because
-- on_rsvp_join_crew happens to sort after this trigger and put it back: an
-- outcome decided by trigger names.
--
-- Whoever stops holding the pass loses the seat, however they stopped holding
-- it; whoever still holds it keeps everything.
create or replace function public.crew_seat_follows_the_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare gone uuid;
begin
  -- Who, if anyone, no longer holds this pass.
  if tg_op = 'DELETE' then
    gone := old.profile_id;
  elsif old.profile_id is distinct from new.profile_id then
    gone := old.profile_id;                       -- handed on
  elsif old.status = 'aboard' and new.status <> 'aboard' then
    gone := old.profile_id;                       -- released
  else
    return coalesce(new, old);                    -- nothing left
  end if;

  if not exists (
    select 1 from public.rsvps r
    where r.profile_id = gone and r.voyage_id = old.voyage_id
      and r.status = 'aboard' and r.id <> old.id
  ) then
    delete from public.thread_members tm
    using public.threads t
    where tm.thread_id = t.id
      and t.kind = 'crew'
      and t.voyage_id = old.voyage_id
      and tm.profile_id = gone;

    delete from public.table_seats ts
    using public.dating_tables dt
    where dt.id = ts.table_id
      and dt.voyage_id = old.voyage_id
      and ts.profile_id = gone;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists crew_seat_follows_the_pass on public.rsvps;
create trigger crew_seat_follows_the_pass
  after delete or update of status, profile_id on public.rsvps
  for each row execute function public.crew_seat_follows_the_pass();

-- The closed-thread staff exemption was added to the trigger, but the messages
-- INSERT policy carries its own closed_at test with no staff branch — so staff
-- were refused by RLS before the trigger could let them through. The fix
-- changed a gate the policy never let them reach.
do $$
declare pol record;
begin
  select qual, with_check into pol
  from pg_policies
  where schemaname = 'public' and tablename = 'messages' and policyname = 'write to own threads';

  if pol.with_check is null then
    raise notice 'policy not found as expected; leaving it alone';
  end if;
end $$;

drop policy if exists "write to own threads" on public.messages;
create policy "write to own threads" on public.messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.in_thread(thread_id)
    and (
      public.is_staff()
      or not exists (
        select 1 from public.threads t
        where t.id = messages.thread_id and t.closed_at is not null
      )
    )
  );;
