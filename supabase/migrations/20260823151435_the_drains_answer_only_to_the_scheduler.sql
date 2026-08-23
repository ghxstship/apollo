-- send-outbox was deployed with verify_jwt=false — anyone on the internet could
-- drain the club's email queue on demand — and send-push/send-sms accepted the
-- publishable anon key that ships in the browser bundle. Nothing distinguished
-- the scheduler from a stranger. A shared secret does.
--
-- NOTE: this migration creates the secret and re-points the cron jobs. The
-- matching check lives in the edge functions themselves.
select vault.create_secret(
  encode(gen_random_bytes(32), 'hex'),
  'CRON_SECRET',
  'Shared secret proving a delivery drain was called by the scheduler, not a stranger.'
)
where not exists (select 1 from vault.secrets where name = 'CRON_SECRET');

do $$
declare v_secret text; j record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'CRON_SECRET';
  if v_secret is null then raise exception 'CRON_SECRET not in the vault'; end if;

  for j in select jobid, command from cron.job where command like '%functions/v1/send-%' loop
    if j.command not like '%x-cron-key%' then
      perform cron.alter_job(j.jobid, command := replace(
        j.command, '''Content-Type'', ''application/json''',
        '''Content-Type'', ''application/json'', ''x-cron-key'', ' || quote_literal(v_secret)));
      perform cron.alter_job(j.jobid, command := replace(
        (select command from cron.job where jobid = j.jobid),
        '''Content-Type'',''application/json''',
        '''Content-Type'',''application/json'',''x-cron-key'',' || quote_literal(v_secret)));
    end if;
  end loop;
end $$;
