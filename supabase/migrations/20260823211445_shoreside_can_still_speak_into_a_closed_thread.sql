-- no_writing_in_a_closed_thread had no staff exemption, so once a sailing
-- completed or was cancelled the only way for Shoreside to answer anything in
-- that thread was to clear threads.closed_at by hand — and no screen offers
-- that. Closing a thread is meant to end the members' conversation, not to
-- lock the shore office out of its own record.
create or replace function public.no_writing_in_a_closed_thread()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  if exists (select 1 from public.threads t
             where t.id = new.thread_id and t.closed_at is not null) then
    raise exception 'that thread closed after the debrief';
  end if;
  return new;
end;
$$;;
