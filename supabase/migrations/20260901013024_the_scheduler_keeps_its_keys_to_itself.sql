-- Three cron jobs embed a service-role JWT and the cron shared secret in
-- cleartext in cron.job.command — send-outbox-drain, send-push-drain,
-- send-sms-drain. An audit flagged that anything able to read cron.job could
-- lift them.
--
-- IT CANNOT, and the reason is worth pinning rather than trusting. anon and
-- authenticated DO hold SELECT on cron.job — that grant is Supabase's default
-- and looks alarming on its own — but neither holds USAGE on the cron schema,
-- so the table can never be reached. Verified as a real member with real JWT
-- claims: "permission denied for schema cron". The privilege that matters is
-- the one that is absent, not the one that is present.
--
-- So nothing is revoked here. Removing a managed grant to fix an exposure that
-- does not exist trades a real risk of breaking the scheduler for no gain. What
-- is added is the assertion, because the safety rests on a single missing USAGE
-- that a later migration could hand out without anyone noticing the connection —
-- and the secrets would be readable by every signed-in member the moment it did.
do $$
declare leaky text := '';
begin
  if has_schema_privilege('anon', 'cron', 'usage') then
    leaky := leaky || ' anon';
  end if;
  if has_schema_privilege('authenticated', 'cron', 'usage') then
    leaky := leaky || ' authenticated';
  end if;
  if leaky <> '' then
    raise exception
      'the cron schema is reachable by:% — cron.job.command holds a service-role JWT and the cron secret in cleartext, so this grant hands both to every signed-in member', leaky;
  end if;
end $$;

-- And the same check as a standing invariant, so it is asserted on every replay
-- rather than only on the day somebody thought to look.
create or replace function public.scheduler_secrets_are_unreachable()
returns table (check_name text, ok boolean, detail text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select 'cron schema unreachable by api roles'::text,
         not (has_schema_privilege('anon', 'cron', 'usage')
           or has_schema_privilege('authenticated', 'cron', 'usage')),
         'cron.job.command stores a service-role JWT and the cron secret in cleartext; the api roles must not reach the schema'::text
$$;

revoke execute on function public.scheduler_secrets_are_unreachable() from public, anon, authenticated;;
