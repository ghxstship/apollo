-- scheduler_health reads the HTTP drains' responses and nothing else. The SQL
-- jobs — installment draws, the clock, retention, the monthly credit, the
-- win-back, now dunning — record their failures in cron.job_run_details, which
-- no page reads. One bad row aborts a whole run, and the next sign of it is a
-- member asking where their month went. Staff-only, like the rest of the Bridge.
create or replace function public.cron_failures(p_limit integer default 50)
returns table (jobname text, status text, return_message text, start_time timestamptz, end_time timestamptz)
language sql
stable
security definer
set search_path to 'public', 'cron'
as $function$
  select j.jobname, d.status, d.return_message, d.start_time, d.end_time
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
  where public.is_staff() and d.status <> 'succeeded'
  order by d.start_time desc
  limit least(coalesce(p_limit, 50), 500)
$function$;

revoke all on function public.cron_failures(integer) from public, anon;
grant execute on function public.cron_failures(integer) to authenticated;;
