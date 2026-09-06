-- One member billed twice is not noise.
--
-- a_failure_that_repeats_wakes_somebody_once (2026-09-06, earlier today) set
-- the application threshold at five repeats inside the window, with the
-- reasoning written into the dial's own note: "One is noise." That is right for
-- a route that threw once because a phone lost signal mid-request, and it is
-- wrong for the only class of failure where a single occurrence has already
-- cost somebody money.
--
-- The class exists as of this deploy. syncSubscription used to discard the
-- error from its upsert into subscriptions, and the error it discarded was the
-- one that matters: subscriptions_one_live_per_member refusing a SECOND live
-- standing for a member who already holds one. Stripe would be billing two
-- while our side held one row. The webhook now records that failure instead of
-- dropping it — but recording it into a bucket that needs five before it says
-- anything means five members are billed twice before the Bridge is told, and
-- nobody would write that threshold down if they had to say it out loud.
--
-- So the money path gets its own reading. app_errors.kind is free text and
-- already carries 'server' and 'cron-skip'; 'money' joins them, and a subject
-- with any 'money' row in the window raises at one. Everything else keeps the
-- dial it had. This is not a new alarm, a new table or a new schedule — it is
-- the same function counting one class of failure differently, which is the
-- narrowest change that closes it.
--
-- Deliberately not a dial. alarm_app_errors stays turnable because the right
-- number for "too noisy" is only knowable from a week of real failures; the
-- right number for "a member was charged twice" is one, in every week there
-- will ever be, and a settings row that could be turned to two is a way for
-- that to stop being true by accident.

create or replace function public.raise_the_alarm()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  f       record;
  told    record;
  raised  integer := 0;
  look    integer := greatest(1, coalesce(public.club_setting('alarm_window_minutes'), 60));
  hours   integer := greatest(1, coalesce(public.club_setting('alarm_repeat_hours'), 6));
  runs    integer := greatest(1, coalesce(public.club_setting('alarm_cron_runs'), 3));
  repeats integer := greatest(1, coalesce(public.club_setting('alarm_app_errors'), 5));
  since   timestamptz;
  opens   timestamptz;
  closes  timestamptz;
  heard   integer;
  said    text;
  word_title text;
  word_body  text;
begin
  since := now() - make_interval(mins => look);
  opens  := date_bin(make_interval(hours => hours), now(), timestamptz '2026-01-01 00:00:00+00');
  closes := opens + make_interval(hours => hours);

  for f in
    select 'scheduler'::text                                           as source,
           j.jobname                                                   as subject,
           count(*)::integer                                           as failures,
           min(d.start_time)                                           as first_at,
           max(d.start_time)                                           as last_at,
           (array_agg(d.return_message order by d.start_time desc))[1] as detail,
           false                                                       as money
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.status = 'failed'
       and d.start_time >= since
     group by j.jobname
    having count(*) >= runs

    union all

    select 'application'::text,
           coalesce(nullif(btrim(e.route), ''), nullif(btrim(e.path), ''), 'an unnamed route')
             || ' · ' ||
           coalesce(nullif(btrim(e.name), ''), nullif(btrim(e.kind), ''), 'Error'),
           count(*)::integer,
           min(e.at),
           max(e.at),
           (array_agg(e.message order by e.at desc))[1],
           bool_or(e.kind = 'money')
      from public.app_errors e
     where e.at >= since
     group by 2
    -- The whole of the change: a subject with a money row in it raises at one.
    having count(*) >= (case when bool_or(e.kind = 'money') then 1 else repeats end)
  loop
    begin
      insert into public.failure_notices
        (source, subject, window_start, window_end, failures, first_at, last_at, detail)
      values
        (f.source, f.subject, opens, closes, f.failures, f.first_at, f.last_at, left(coalesce(f.detail, ''), 2000))
      on conflict (source, subject, window_start) do nothing;

      if not found then
        continue;
      end if;

      said := left(
        coalesce(
          nullif(btrim(regexp_replace(
            regexp_replace(split_part(coalesce(f.detail, ''), chr(10), 1), '^(ERROR|FATAL|PANIC):\s*', ''),
            '\s+', ' ', 'g')), ''),
          'nothing at all'),
        240);

      if f.source = 'scheduler' then
        word_title := 'A scheduled job is failing: ' || f.subject || '.';
        word_body  := f.subject || ' has failed ' || f.failures ||
                 case when f.failures = 1 then ' run since ' else ' runs since ' end ||
                 to_char(f.first_at at time zone public.club_zone(), 'FMHH12:MIam') ||
                 '. The last one said: ' || said ||
                 '. Nothing that job does is getting done until it runs clean.';
      elsif f.money then
        -- Named for what it is. An operator reading this at two in the morning
        -- should not have to work out from a route and a count that somebody's
        -- card has already been charged.
        word_title := 'Money moved wrongly: ' || split_part(f.subject, ' · ', 1) || '.';
        word_body  := f.subject || ' failed ' ||
                 case when f.failures = 1 then 'once' else f.failures || ' times' end ||
                 ' since ' || to_char(f.first_at at time zone public.club_zone(), 'FMHH12:MIam') ||
                 '. It said: ' || said ||
                 '. A member may have been charged for something the club did not record — check the processor against the ledger before anything else.';
      else
        word_title := 'The same failure, ' || f.failures || ' times: ' || split_part(f.subject, ' · ', 1) || '.';
        word_body  := f.subject || ' has failed ' || f.failures || ' times since ' ||
                 to_char(f.first_at at time zone public.club_zone(), 'FMHH12:MIam') ||
                 '. It said: ' || said ||
                 '. The reports screen has the rest.';
      end if;

      heard := 0;
      for told in
        select p.id
          from public.profiles p
         where p.is_staff
           and p.status <> 'departed'
      loop
        insert into public.notifications (profile_id, kind, title, body, href)
        values (told.id, 'word', word_title, word_body, '/bridge/reports');
        heard := heard + 1;
      end loop;

      update public.failure_notices
         set told_to = heard
       where source = f.source and subject = f.subject and window_start = opens;

      raised := raised + 1;
    exception when others then
      perform public.note_cron_skip('raise_the_alarm', f.source || ' ' || f.subject, sqlerrm, sqlstate);
    end;
  end loop;

  return raised;
end $fn$;

revoke all on function public.raise_the_alarm() from public, anon, authenticated;

comment on function public.raise_the_alarm() is
  'Tells the Bridge, once per distinct failure per window, that a scheduled job or an application route is failing — with the count and the hour in the Word. A scheduled job raises at club_setting(''alarm_cron_runs''), an ordinary route at club_setting(''alarm_app_errors''), and an app_errors row of kind ''money'' at the first occurrence, because one member charged twice is not noise. Reads cron.job_run_details and app_errors; writes public.notifications, which fans out to push. Runs every fifteen minutes.';

notify pgrst, 'reload schema';
