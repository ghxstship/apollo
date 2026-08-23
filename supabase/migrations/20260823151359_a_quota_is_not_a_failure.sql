-- 'failed' was terminal and the drain only reads 'pending', so a provider saying
-- "try later" — a 429 daily quota — permanently stranded the message. Seventy
-- were never going to be sent again, and nothing surfaced that.
alter table public.email_outbox
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error text;

alter table public.sms_outbox
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error text;

comment on column public.email_outbox.next_attempt_at is
  'Set when a send failed for a reason worth retrying. The drain skips the row until this passes.';
