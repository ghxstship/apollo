-- The club has two good panels and no alarm.
--
-- app_errors collects what the application failed on, and the Bridge's reports
-- screen shows the last fifty. cron_failures() reads the scheduler's own
-- failures out of cron.job_run_details, and — until this migration — no screen
-- read it at all. Both currently answer zero, which is genuinely healthy:
-- 1 827 scheduled runs in the last day, none of them failed.
--
-- A panel is a thing a person has to open. The first real dunning failure or
-- drain outage will sit in one until somebody does, and the sign of it will be
-- a member asking where their month went — which is the exact sentence
-- cron_failures() was written under, two days ago, and it is still true,
-- because seeing a failure and being told about one are different things.
--
-- So: an alarm, on the path the club already has. A row in public.notifications
-- fans out to push through fan_out_notification(); warn_of_expiring_keys()
-- established the shape this morning — a notices table keyed on the identity of
-- the thing being warned about, one Word per identity, the whole Bridge as the
-- recipient when nobody owns the problem. This follows it rather than
-- inventing a second one.
--
-- FOUR DECISIONS, ALL OF WHICH ARE THE POINT.
--
-- 1. WHAT IS DEDUPED. An outage produces the same failure every five minutes.
--    An alarm that fires 288 times in a day is an alarm nobody reads by the
--    second day, so the key is the identity of the failure and not the row:
--    the job's name for a scheduled failure, the route and the error's name for
--    an application one. Every failure sharing that identity inside one window
--    produces exactly one Word, with the count in it. The window is in the
--    primary key of failure_notices, so "once" is enforced by the database
--    rather than by remembering to check — the same reason api_key_notices
--    keys on (key, end date, rung).
--
-- 2. TWO SOURCES, DIFFERENT THRESHOLDS, ONE JOB. A single application error is
--    noise — one member, one bad row, one browser. A scheduled job that has
--    failed three runs running is not: at five-minute cadence that is a
--    quarter of an hour in which nothing that job does is getting done. So the
--    scheduler pass fires at three failed runs and the application pass at
--    five repeats of the same failure. One job, because the recipient, the
--    dedupe table and the clock are identical for both and two jobs would
--    double the surface for the same answer.
--
-- 3. WHAT COUNTS AS A FAILED RUN. cron_failures() selects `status <>
--    'succeeded'`, which is right for a panel and wrong for an alarm: pg_cron
--    writes 'starting', 'running', 'sending' and 'connecting' to that column
--    while a run is in flight, and a healthy job caught mid-run would read as
--    a failure. The alarm counts 'failed' and nothing else. The panel keeps
--    the broader list, where a run sitting in 'running' is worth a look.
--
-- 4. THE ALARM IS NOT EXEMPT FROM ITSELF. When a row of this function throws,
--    it records the skip through note_cron_skip like every other scheduled job
--    — into app_errors, under its own name, where its own next pass will count
--    it. That is deliberate and it is bounded: one row per run, and telling is
--    deduped per window like everything else. What it cannot witness is its
--    own death, which is what the new Failed runs pane on the reports screen
--    is for.
--
-- Never an address. The path is push and the Bridge's inbox; nothing here
-- touches email_outbox, and no fixture mailbox is involved.

-- ── The dials ───────────────────────────────────────────────────────────────
-- Beside dues_grace_days and the api_key_* rungs, so the owner can move a
-- threshold without a deploy — which matters more here than anywhere else,
-- because the right number for "too noisy" is only knowable once the club has
-- a week of real failures to look at.
insert into public.club_settings (key, value_int, note) values
  ('alarm_window_minutes',  60, 'How far back the failure alarm counts. A failure older than this is history and the panel''s business.'),
  ('alarm_repeat_hours',     6, 'One Word per distinct failure per this many hours. A failure still going at the end of a window earns a second Word, not a 288th.'),
  ('alarm_cron_runs',        3, 'Failed runs of one scheduled job inside the window before the Bridge is woken.'),
  ('alarm_app_errors',       5, 'Repeats of one application failure inside the window before the Bridge is woken. One is noise.')
on conflict (key) do nothing;

-- ── What was told, and about what ───────────────────────────────────────────

create table if not exists public.failure_notices (
  source       text not null check (source in ('scheduler', 'application')),
  subject      text not null,
  window_start timestamptz not null,
  window_end   timestamptz not null,
  failures     integer not null,
  first_at     timestamptz not null,
  last_at      timestamptz not null,
  detail       text,
  told_to      integer not null default 0,
  told_at      timestamptz not null default now(),
  primary key (source, subject, window_start)
);

comment on table public.failure_notices is
  'One row per distinct failure per window: what was wrong, how many times, and when the Bridge was told. The primary key is what makes it once — a second attempt inside the same window conflicts and says nothing.';
comment on column public.failure_notices.subject is
  'The identity of the failure. A scheduled job''s name; or an application route and the error''s name, joined by a middle dot.';
comment on column public.failure_notices.told_to is
  'How many seats on the Bridge got the Word. Zero is a fact worth seeing on the panel: it means the alarm rang in an empty room.';
comment on column public.failure_notices.window_end is
  'When the silence expires. Every failure with this subject between first_at and here is covered by the one Word, which is how the reports screen knows what to mark as told.';

create index if not exists failure_notices_told_at_idx on public.failure_notices (told_at desc);

alter table public.failure_notices enable row level security;

drop policy if exists "the bridge reads when it was told" on public.failure_notices;
create policy "the bridge reads when it was told" on public.failure_notices
  for select to authenticated using ((select public.is_staff()));

grant select on public.failure_notices to authenticated;

-- ── The alarm ───────────────────────────────────────────────────────────────

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
  -- greatest(1, …) because every one of these is a dial an owner can turn, and
  -- a zero in any of them is either a division by nothing or an alarm that
  -- fires on the empty set.
  look    integer := greatest(1, coalesce(public.club_setting('alarm_window_minutes'), 60));
  hours   integer := greatest(1, coalesce(public.club_setting('alarm_repeat_hours'), 6));
  runs    integer := greatest(1, coalesce(public.club_setting('alarm_cron_runs'), 3));
  repeats integer := greatest(1, coalesce(public.club_setting('alarm_app_errors'), 5));
  since   timestamptz;
  opens   timestamptz;
  closes  timestamptz;
  heard   integer;
  said    text;
  -- Named apart from the notifications columns they fill: plpgsql resolves a
  -- bare `title` in a VALUES list to the variable, and a reader should not
  -- have to know that to be sure which one is meant.
  word_title text;
  word_body  text;
begin
  since := now() - make_interval(mins => look);

  -- A tumbling window rather than a sliding one, so the bucket is a value that
  -- two runs of this function agree on without having to read each other, and
  -- the primary key can carry it. Origin is fixed so the buckets do not move
  -- when the dial does.
  opens  := date_bin(make_interval(hours => hours), now(), timestamptz '2026-01-01 00:00:00+00');
  closes := opens + make_interval(hours => hours);

  for f in
    -- The scheduler's own failures, one row per job. The message kept is the
    -- most recent one: a job failing on two different things is still one job
    -- that is down, and the newest reason is the one to act on.
    select 'scheduler'::text                                           as source,
           j.jobname                                                   as subject,
           count(*)::integer                                           as failures,
           min(d.start_time)                                           as first_at,
           max(d.start_time)                                           as last_at,
           (array_agg(d.return_message order by d.start_time desc))[1] as detail
      from cron.job_run_details d
      join cron.job j on j.jobid = d.jobid
     where d.status = 'failed'
       and d.start_time >= since
     group by j.jobname
    having count(*) >= runs

    union all

    -- What the application failed on. The identity is the route plus the
    -- error's name — a route failing two different ways is two things to fix,
    -- and a name with no route (a skipped row from a scheduled job records the
    -- job's name there) still lands on a subject a person can read.
    select 'application'::text,
           coalesce(nullif(btrim(e.route), ''), nullif(btrim(e.path), ''), 'an unnamed route')
             || ' · ' ||
           coalesce(nullif(btrim(e.name), ''), nullif(btrim(e.kind), ''), 'Error'),
           count(*)::integer,
           min(e.at),
           max(e.at),
           (array_agg(e.message order by e.at desc))[1]
      from public.app_errors e
     where e.at >= since
     group by 2
    having count(*) >= repeats
  loop
    -- One failure at a time in its own subtransaction. An operator whose
    -- profile has gone strange, a notice that will not insert — none of it may
    -- take the run down and leave every other failure unreported. The idiom is
    -- the one every scheduled job in this schema has used since 2026-09-06.
    begin
      insert into public.failure_notices
        (source, subject, window_start, window_end, failures, first_at, last_at, detail)
      values
        (f.source, f.subject, opens, closes, f.failures, f.first_at, f.last_at, left(coalesce(f.detail, ''), 2000))
      on conflict (source, subject, window_start) do nothing;

      -- Already told, this window. This is the whole of "do not cry wolf": the
      -- conflict is the silence, and it is the database's decision rather than
      -- a flag this function has to remember to read.
      if not found then
        continue;
      end if;

      -- What the failure said, in one line a person can read. A plpgsql
      -- exception arrives as ERROR: … newline CONTEXT: … newline the whole
      -- call stack, and pasting that into somebody's phone at two in the
      -- morning is the opposite of the point. First line, no prefix, one
      -- space between words.
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
      else
        -- Not "N people have hit this": a skipped row recorded by a scheduled
        -- job lands in app_errors too, and nobody was standing in front of it.
        word_title := 'The same failure, ' || f.failures || ' times: ' || split_part(f.subject, ' · ', 1) || '.';
        word_body  := f.subject || ' has failed ' || f.failures || ' times since ' ||
                 to_char(f.first_at at time zone public.club_zone(), 'FMHH12:MIam') ||
                 '. It said: ' || said ||
                 '. The reports screen has the rest.';
      end if;

      -- Who hears it. warn_of_expiring_keys() sends to the operator who cut
      -- the key and falls back to the whole Bridge when nobody owns it, on the
      -- reasoning that an unowned key about to stop is everybody's. A failing
      -- job and a failing route are never owned by one operator, so they are
      -- always everybody's — every seat on the Bridge that has not departed.
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
  'Tells the Bridge, once per distinct failure per window, that a scheduled job or an application route is failing — with the count and the hour in the Word. Reads cron.job_run_details and app_errors; writes public.notifications, which fans out to push. Runs every fifteen minutes.';

-- Every fifteen minutes. The scheduled jobs this watches run at five, so three
-- failed runs have accumulated inside one pass of the alarm and the Bridge
-- hears about an outage within twenty minutes of its starting — soon enough to
-- act on, slow enough that a single bad minute has resolved itself.
select cron.schedule('failure-alarm', '*/15 * * * *', $$select public.raise_the_alarm()$$);

notify pgrst, 'reload schema';
