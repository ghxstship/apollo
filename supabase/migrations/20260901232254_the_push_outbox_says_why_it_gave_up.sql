-- email_outbox and sms_outbox carry last_error; push_outbox never did, so the
-- drain's requeue wrote to a column that was not there and the Bridge's
-- dead-letter list could not read it. Same shape as its siblings.
alter table public.push_outbox add column if not exists last_error text;;
