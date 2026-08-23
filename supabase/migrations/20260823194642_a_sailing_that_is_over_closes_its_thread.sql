-- threads.closed_at is READ in four places and written in none: no migration,
-- no trigger, no action, no staff control. So the crew thread for a cancelled
-- sailing stayed open forever with its whole roster still seated and posting,
-- and the copy "This thread closed after the debrief." was unreachable.
--
-- A separate trigger rather than another branch inside handle_voyage_status,
-- which is long and handles the money.
create or replace function public.close_threads_when_the_sailing_ends()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('cancelled', 'completed') and old.status is distinct from new.status then
    update public.threads
       set closed_at = now()
     where voyage_id = new.id and closed_at is null;
  elsif old.status in ('cancelled', 'completed')
        and new.status not in ('cancelled', 'completed') then
    -- A sailing put back on the calendar reopens its thread.
    update public.threads
       set closed_at = null
     where voyage_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.close_threads_when_the_sailing_ends() from public, anon, authenticated;

drop trigger if exists close_threads_when_the_sailing_ends on public.voyages;
create trigger close_threads_when_the_sailing_ends
  after update of status on public.voyages
  for each row execute function public.close_threads_when_the_sailing_ends();

-- Catch up the ones already past.
update public.threads t
   set closed_at = coalesce(v.starts_at, now())
  from public.voyages v
 where t.voyage_id = v.id
   and v.status in ('cancelled', 'completed')
   and t.closed_at is null;

-- A closed thread takes no new messages. It was only ever a rendering hint.
create or replace function public.no_writing_in_a_closed_thread()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.threads t
             where t.id = new.thread_id and t.closed_at is not null) then
    raise exception 'that thread closed after the debrief';
  end if;
  return new;
end;
$$;

revoke execute on function public.no_writing_in_a_closed_thread() from public, anon, authenticated;

drop trigger if exists no_writing_in_a_closed_thread on public.messages;
create trigger no_writing_in_a_closed_thread
  before insert on public.messages
  for each row execute function public.no_writing_in_a_closed_thread();;
