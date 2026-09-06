-- Three scheduled jobs held a live credential in plain text.
--
-- The drain jobs called their edge function with net.http_post and built the
-- headers inline, so cron.job.command contained the x-cron-key -- the shared
-- secret those three functions authenticate on -- as a literal string, plus the
-- anon JWT beside it.
--
-- How bad, precisely, because "a secret in the database" deserves a real
-- reading rather than an alarmed one:
--
--   cron.job carries `=r/supabase_admin`, which is PUBLIC read. But the cron
--   SCHEMA grants USAGE only to supabase_admin and postgres, so anon and
--   authenticated cannot reach the table, and PostgREST exposes only public --
--   no member can read this.
--
--   What can: anything holding the postgres role (the dashboard's SQL editor),
--   any SECURITY DEFINER function owned by postgres whose search_path reaches
--   cron, and every database backup, forever. A secret in a backup is a secret
--   with no expiry and no audit trail, and it is the one that outlives the
--   incident that leaks it.
--
--   The anon JWT beside it is not a secret at all -- it ships to every browser
--   by design -- so it is left alone rather than dressed up as one.
--
-- The club already had the answer and was using it elsewhere: CRON_SECRET is in
-- the vault, send-outbox reads it through get_app_secret() at run time, and the
-- function is granted to postgres and service_role alone. The jobs simply
-- predated it.
--
-- So the command stops carrying anything. All three become one call to one
-- function, which reads what it needs at the moment it needs it -- and the
-- three commands, which were 553, 529 and 528 characters of duplicated headers,
-- become forty characters of plain SQL like every other job on the schedule.

-- The anon key is public and was already in three cron commands; it moves to
-- the vault for tidiness rather than for secrecy, so the function has one place
-- to read from. Lifted from the existing command rather than typed into this
-- file: a migration in a repository is the last place a key of any kind should
-- be written down, even a public one.
do $$
declare v_anon text;
begin
  select substring(command from 'Bearer (eyJ[A-Za-z0-9_.-]+)') into v_anon
    from cron.job where jobname = 'send-outbox-drain';

  if v_anon is null then
    /* Already migrated, or the job is not on this database. Either way there
       is nothing to lift and nothing to fail about. */
    return;
  end if;
  if exists (select 1 from vault.secrets where name = 'ANON_KEY') then
    return;
  end if;
  perform vault.create_secret(v_anon, 'ANON_KEY',
    'The publishable anon key. Public by design — it ships to every browser — and held here only so the drain caller has one place to read from.');
end $$;

-- Before anything is rewritten: prove the vault holds the same cron key the
-- jobs are currently using. If it does not, rewriting the commands would leave
-- three drains authenticating with the wrong secret and the outbox silently
-- stopping, which is the failure this migration must not cause.
do $$
declare v_embedded text; v_vault text;
begin
  select substring(command from '''x-cron-key'',\s*''([^'']+)''') into v_embedded
    from cron.job where jobname = 'send-outbox-drain';
  if v_embedded is null then
    return; /* already migrated */
  end if;
  select public.get_app_secret('CRON_SECRET') into v_vault;
  if v_vault is null or v_vault <> v_embedded then
    raise exception 'the vault''s CRON_SECRET does not match the key the drains are using — fix the vault before moving the jobs, or the outbox stops';
  end if;
end $$;

create or replace function public.wake_the_drain(p_function text)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_id bigint;
begin
  /* An allow-list, not a string the caller composes. This function builds a URL
     and attaches a live credential to it, so a caller that could name any
     destination could point the club's own cron key at a machine it chose. */
  if p_function not in ('send-outbox', 'send-sms', 'send-push') then
    raise exception 'that is not a drain this club runs' using errcode = '22023';
  end if;
  /* No project, no call. A replayed corpus in a local container has no
     project_ref, and a URL built from an empty string would be a request to
     somebody else's hostname carrying this club's key. */
  if public.club_setting_text('project_ref') is null then
    raise exception 'no project_ref is set — this database does not know which deployment it is'
      using errcode = '22023';
  end if;

  select net.http_post(
    url := 'https://' || coalesce(public.club_setting_text('project_ref'), '') || '.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', public.get_app_secret('CRON_SECRET'),
      'Authorization', 'Bearer ' || public.get_app_secret('ANON_KEY')
    ),
    body := '{}'::jsonb
  ) into v_id;
  return v_id;
end $fn$;

revoke all on function public.wake_the_drain(text) from public, anon, authenticated;

comment on function public.wake_the_drain(text) is
  'Calls one of the club''s three drain functions, reading the cron key from the vault at the moment of the call rather than carrying it in the job''s own text. The destination is an allow-list and not a string the caller composes: this function attaches a live credential to a URL, and a caller free to name the URL could point that credential anywhere.';

-- The project reference, so the function does not carry a hostname either.
--
-- In club_settings rather than a database-level setting: `alter database ... set`
-- wants superuser, which migrations here do not have and should not want, and
-- the dials table is where every other figure two places need already lives.
-- Lifted from the existing command for the same reason as the anon key — the
-- corpus has to replay into a local container that is not this project, and a
-- hostname written into a migration would send that container's drains here.
do $$
declare v_ref text;
begin
  select substring(command from 'https://([a-z0-9]+)\.supabase\.co') into v_ref
    from cron.job where jobname = 'send-outbox-drain';
  if v_ref is null then
    return;
  end if;
  insert into public.club_settings (key, value_int, value_text, note)
  values ('project_ref', 0, v_ref,
          'The Supabase project this database belongs to, used to build the drain function URLs. Read from the running jobs when this migration ran rather than written down, so a replay into a local container does not point that container''s drains at production.')
  on conflict (key) do update set value_text = excluded.value_text;
end $$;

-- And the three jobs stop carrying anything. cron.schedule updates by name.
do $$
declare j record;
begin
  for j in
    select * from (values
      ('send-outbox-drain', 'send-outbox'),
      ('send-sms-drain',    'send-sms'),
      ('send-push-drain',   'send-push')
    ) as t(jobname, fn)
  loop
    if exists (select 1 from cron.job c where c.jobname = j.jobname) then
      perform cron.schedule(j.jobname, '*/5 * * * *',
        format('select public.wake_the_drain(%L)', j.fn));
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
