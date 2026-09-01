/* Housekeeping that waited for a human, and a queue that couldn't.

   1. "Your ID is deleted 30 days after your last sailing" and the six-year
      signature purge were correct staff RPCs that ran only when somebody
      pressed the button — and their is_staff() checks meant a schedule could
      not call them as written. The staff RPCs keep their doors; the
      scheduler gets unattended clones, unexported to the API. (First attempt
      revoked a no-arg signature the clone doesn't have; the whole migration
      rolled back, which is the shape working as designed.)

   2. push_outbox had attempts and next_attempt_at that nothing wrote, no
      claimed_at at all, and a drain with no claim and no retry — the exact
      double-send-and-terminal-fail pair its two siblings each fixed. The
      columns land here; the drain that uses them ships with this commit; the
      stall rescue now covers all three queues.

   3. One rewards row still read "Twenty-five dollars at the The Shop" — the
      brand purge replacing a shop name mid-sentence after an existing "the".
      Repaired and asserted. */

alter table public.push_outbox add column if not exists claimed_at timestamptz;
alter table public.push_outbox add column if not exists attempts integer;
alter table public.push_outbox add column if not exists next_attempt_at timestamptz;

create or replace function public.requeue_stalled_sends()
returns integer language plpgsql security definer set search_path to 'public'
as $fn$
declare n integer;
begin
  update public.email_outbox
  set status = 'pending', next_attempt_at = now(), claimed_at = null,
      attempts = coalesce(attempts, 0) + 1,
      last_error = coalesce(last_error, '') || ' | recovered from a stalled send'
  where status = 'sending'
    and coalesce(claimed_at, created_at) < now() - interval '15 minutes'
    and coalesce(attempts, 0) < 5;
  get diagnostics n = row_count;

  update public.sms_outbox
  set status = 'pending', next_attempt_at = now(), claimed_at = null,
      attempts = coalesce(attempts, 0) + 1
  where status = 'sending'
    and coalesce(claimed_at, created_at) < now() - interval '15 minutes'
    and coalesce(attempts, 0) < 5;

  update public.push_outbox
  set status = 'pending', next_attempt_at = now(), claimed_at = null,
      attempts = coalesce(attempts, 0) + 1
  where status = 'sending'
    and coalesce(claimed_at, created_at) < now() - interval '15 minutes'
    and coalesce(attempts, 0) < 5;

  return n;
end $fn$;

-- The scheduler's doors: same bodies as the staff RPCs minus the badge check,
-- cloned from the live definitions so the retention logic stays exactly what
-- the Bridge runs; refuses if the anchors are gone.
do $mig$
declare src text; patched text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'purge_expired_signatures';
  patched := replace(src, 'FUNCTION public.purge_expired_signatures(', 'FUNCTION public.purge_expired_signatures_unattended(');
  patched := regexp_replace(patched, 'if not public\.is_staff\(\) then.*?end if;', '', 'n');
  if patched = src or patched not like '%purge_expired_signatures_unattended%' or patched like '%is_staff%' then
    raise exception 'the signature-purge clone anchored on nothing';
  end if;
  execute patched;

  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'purge_spent_identity_records';
  patched := replace(src, 'FUNCTION public.purge_spent_identity_records(', 'FUNCTION public.purge_spent_identity_unattended(');
  patched := regexp_replace(patched, 'if not public\.is_staff\(\) then.*?end if;', '', 'n');
  if patched = src or patched not like '%purge_spent_identity_unattended%' or patched like '%is_staff%' then
    raise exception 'the identity-purge clone anchored on nothing';
  end if;
  execute patched;
end $mig$;

create or replace function public.cron_purge_expired_records()
returns void language plpgsql security definer set search_path to 'public'
as $fn$
begin
  perform public.purge_expired_signatures_unattended(6);
  perform public.purge_spent_identity_unattended();
end $fn$;

revoke all on function public.purge_expired_signatures_unattended(integer) from public, anon, authenticated;
revoke all on function public.purge_spent_identity_unattended() from public, anon, authenticated;
revoke all on function public.cron_purge_expired_records() from public, anon, authenticated;

select cron.schedule('retention-runs-daily', '30 8 * * *', 'select public.cron_purge_expired_records();');

update public.rewards set name = replace(name, 'at the The Shop', 'at the Shop')
 where name like '%at the The Shop%';
do $mig$
declare n int;
begin
  select count(*) into n from public.rewards where name like '%the The %';
  if n > 0 then raise exception 'a doubled article survives in % reward name(s)', n; end if;
end $mig$;;
