-- requeue_stalled_sends exists to rescue a row whose sender died mid-flight.
-- It decides what "mid-flight" means from `created_at`, which is when the
-- letter was QUEUED, not when a sender picked it up.
--
-- So a letter created twenty minutes ago and claimed ten seconds ago — sitting
-- legitimately in a live call to Resend right now — matches, is flipped back to
-- pending, and is sent a second time. The busier the queue, the more of it
-- qualifies. And because the function never increments `attempts`, it is not
-- bounded by MAX_ATTEMPTS: it can do this indefinitely.
--
-- A row now records when it was claimed, and the rescue measures from that. The
-- attempt is counted too, so a row that genuinely cannot be sent stops being
-- rescued forever and becomes a failure somebody can see.
alter table public.email_outbox add column if not exists claimed_at timestamptz;
alter table public.sms_outbox   add column if not exists claimed_at timestamptz;

comment on column public.email_outbox.claimed_at is
  'When a sender took this row. The stall rescue measures from here — created_at is when the letter was written, which says nothing about whether a send is in flight.';

create or replace function public.requeue_stalled_sends()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  update public.email_outbox
  set status = 'pending',
      next_attempt_at = now(),
      claimed_at = null,
      attempts = coalesce(attempts, 0) + 1,
      last_error = coalesce(last_error, '') || ' | recovered from a stalled send'
  where status = 'sending'
    -- Fall back to created_at only for rows claimed before this column existed.
    and coalesce(claimed_at, created_at) < now() - interval '15 minutes'
    and coalesce(attempts, 0) < 5;
  get diagnostics n = row_count;

  update public.sms_outbox
  set status = 'pending',
      next_attempt_at = now(),
      claimed_at = null,
      attempts = coalesce(attempts, 0) + 1
  where status = 'sending'
    and coalesce(claimed_at, created_at) < now() - interval '15 minutes'
    and coalesce(attempts, 0) < 5;

  return n;
end;
$function$;
;
