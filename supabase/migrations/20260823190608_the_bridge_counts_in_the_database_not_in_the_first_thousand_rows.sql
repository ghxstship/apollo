-- /bridge/reports fetched every outbox row and counted them in JavaScript.
-- PostgREST caps a response at 1000, so once a queue passed that the counters
-- froze: push read "0 PENDING · 0 SENT · 1000 SKIPPED" while 14 were actually
-- waiting, under a lede that says "Pending is the queue". A number that stops
-- moving is worse than no number, because the operator keeps trusting it.
--
-- Counting belongs where the rows are.
create or replace function public.delivery_health()
returns table (channel text, status text, n bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select 'email', status, count(*) from public.email_outbox group by status
  union all
  select 'push', status, count(*) from public.push_outbox group by status
  union all
  select 'sms', status, count(*) from public.sms_outbox group by status
$$;

revoke execute on function public.delivery_health() from public, anon, authenticated;
grant execute on function public.delivery_health() to authenticated;

-- The Word is member-private and has no staff SELECT policy, so the Bridge's
-- "weather notices sent" counted only the operator's own notifications and
-- rendered 0 while 14 had gone out. Staff are owed the volume, not the
-- contents — so this returns a number and never a row.
create or replace function public.notice_count(p_kind text)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*) from public.notifications where kind = p_kind
$$;

revoke execute on function public.notice_count(text) from public, anon, authenticated;
grant execute on function public.notice_count(text) to authenticated;;
