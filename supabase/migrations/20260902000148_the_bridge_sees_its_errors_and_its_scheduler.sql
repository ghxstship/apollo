-- Errors were console lines in a log drain nobody read; scheduler responses
-- sat in net._http_response unread while cron.job_run_details said "succeeded".
-- Both now reach the Bridge. When an external tracker is chosen, app_errors is
-- the table it is fed from.
create table public.app_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  deployment text,
  name text,
  message text not null,
  digest text,
  method text,
  path text,
  route text,
  kind text
);
create index app_errors_at_idx on public.app_errors (at desc);
alter table public.app_errors enable row level security;
create policy "the bridge reads the errors" on public.app_errors
  for select to authenticated using (public.is_staff());
-- Written by the server with the service role only; no client policy.

create or replace function public.scheduler_health(p_limit integer default 100)
returns table (id bigint, status_code integer, timed_out boolean, error_msg text, created timestamptz, body text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.id, r.status_code, r.timed_out, r.error_msg, r.created, left(r.content, 240)
  from net._http_response r
  where public.is_staff()
  order by r.created desc
  limit least(coalesce(p_limit, 100), 500)
$$;
grant execute on function public.scheduler_health(integer) to authenticated;;
