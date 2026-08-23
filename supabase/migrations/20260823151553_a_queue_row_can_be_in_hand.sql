-- Claiming a row before the provider call needs a state for "in hand". Without
-- it two concurrent drains both send the same message and only the marking
-- collides — which is the shape the old code had.
alter table public.email_outbox drop constraint if exists email_outbox_status_check;
alter table public.email_outbox add constraint email_outbox_status_check
  check (status = any (array['pending','sending','sent','skipped','failed']));

alter table public.sms_outbox drop constraint if exists sms_outbox_status_check;
alter table public.sms_outbox add constraint sms_outbox_status_check
  check (status = any (array['pending','sending','sent','skipped','failed']));

create or replace function public.requeue_stalled_sends()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare n integer;
begin
  update public.email_outbox
  set status = 'pending', next_attempt_at = now(),
      last_error = coalesce(last_error, '') || ' | recovered from a stalled send'
  where status = 'sending' and created_at < now() - interval '15 minutes';
  get diagnostics n = row_count;

  update public.sms_outbox
  set status = 'pending', next_attempt_at = now()
  where status = 'sending' and created_at < now() - interval '15 minutes';
  return n;
end;
$$;

revoke execute on function public.requeue_stalled_sends() from public, anon, authenticated;

select cron.schedule('requeue-stalled-sends', '*/15 * * * *', 'select public.requeue_stalled_sends()')
where not exists (select 1 from cron.job where jobname = 'requeue-stalled-sends');
