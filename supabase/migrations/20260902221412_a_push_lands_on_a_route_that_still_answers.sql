/* A push notification is the one surface where a member cannot see a redirect.
   The browser opens the URL the payload carries; if it 308s, the member has
   already left the notification behind and is watching a second load happen.

   Two functions still built push URLs from the pre-rename route table:
   fan_out_notification pointed both the 'manifest' and the 'weather' kinds at
   /manifest, and handle_episode_status pointed its cancellation push at the
   same place. next.config.ts has redirected /manifest -> /passes (permanent)
   since the surfaces were aligned. Both now name /passes directly.

   /word -> /inbox is the other half of the same story. No live function writes
   it any more — the last one was corrected on 2026-08-21 — but 58 rows queued
   before that are sitting in push_outbox carrying it, and requeue_outbox_row()
   lets a staff member put a 'skipped' row back on the wire. A stale row is
   therefore not inert; it is one button press from being sent. The backfill
   corrects the queue as well as the writers, and it is bounded to the two
   retired paths so no other URL is touched. */
do $mig$
declare
  d text; d2 text; fn oid; n int;
begin
  -- fan_out_notification: two arms of one case expression.
  select p.oid into fn from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.prokind = 'f' and p.proname = 'fan_out_notification';
  if fn is null then raise exception 'fan_out_notification is not here'; end if;
  d := pg_get_functiondef(fn);
  d2 := replace(d, $o$then '/manifest'$o$, $n$then '/passes'$n$);
  if d2 = d then raise exception 'fan_out_notification no longer routes to /manifest'; end if;
  execute d2;
  if pg_get_functiondef(fn) like '%/manifest%' then
    raise exception 'fan_out_notification still routes to /manifest';
  end if;

  -- handle_episode_status: the cancellation push for a member who muted the
  -- in-app notice. The same letter, on the route that answers.
  select p.oid into fn from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
   where n2.nspname = 'public' and p.prokind = 'f' and p.proname = 'handle_episode_status';
  if fn is null then raise exception 'handle_episode_status is not here'; end if;
  d := pg_get_functiondef(fn);
  d2 := replace(d, $o$'Your account is credited in full.', '/manifest'$o$,
                   $n$'Your account is credited in full.', '/passes'$n$);
  if d2 = d then raise exception 'handle_episode_status no longer pushes to /manifest'; end if;
  execute d2;
  if pg_get_functiondef(fn) like '%/manifest%' then
    raise exception 'handle_episode_status still routes to /manifest';
  end if;

  -- The queue itself. Bounded to the two retired paths.
  update public.push_outbox set url = '/passes' where url = '/manifest';
  get diagnostics n = row_count;
  raise notice 'push_outbox rows moved off /manifest: %', n;
  update public.push_outbox set url = '/inbox' where url = '/word';
  get diagnostics n = row_count;
  raise notice 'push_outbox rows moved off /word: %', n;

  if exists (select 1 from public.push_outbox where url in ('/manifest', '/word')) then
    raise exception 'a push row still points at a retired route';
  end if;
end $mig$;;
