-- "SKIPPED" on the Bridge is one number covering two unrelated things: a
-- fixture address the no_real_mail_to_a_fixture guard correctly held back, and
-- a real member's letter that was skipped for a reason nobody chose — no API
-- key, no push subscription, no registered text template.
--
-- There are 1,399 skipped rows and essentially all of them are fixtures, so the
-- number reads as noise and always will. A real member's suppressed letter
-- would land in the middle of it and be invisible. A count that can only ever
-- be ignored is not a signal.
--
-- Split, so the fixture noise stays out of the way of the thing an operator
-- should act on. The reason lives in last_error, which the guard already
-- writes.
create or replace function public.delivery_health()
returns table(channel text, status text, n bigint)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then
    raise exception 'that is the Bridge''s to read';
  end if;

  return query
    select 'email'::text,
           case
             when e.status = 'skipped' and coalesce(e.last_error, '') ilike '%fixture%'
               then 'held_back_fixture'
             when e.status = 'skipped'
               then 'skipped_real'
             else e.status::text
           end,
           count(*)
      from public.email_outbox e
     group by 2
    union all
    select 'push'::text, p.status::text, count(*) from public.push_outbox p group by p.status
    union all
    select 'sms'::text, s.status::text, count(*) from public.sms_outbox s group by s.status;
end;
$function$;
;
