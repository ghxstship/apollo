-- From the 2026-09-04 communications pass. Every call time in a pass letter
-- rendered in the sender's own zone, because the payload carried starts_at and
-- never the episode's time_zone; two applicant letters had no name to greet
-- with; the invitation still queued under the retired code; the cancellation
-- text went out on the weather-hold SMS draft ("X is held for weather. The
-- club called it."); the Docked word named cameras and the old name for the
-- Log; and queue_email accepted a letter code the registry did not know.
-- Surgery on live bodies, each anchored on the exact line it changes.

do $$
declare src text;
begin
  -- carry_the_clock: the gangway letter and the Docked word
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'carry_the_clock' and p.pronamespace = 'public'::regnamespace;
  if src not like '%''starts_at'', v.starts_at, ''code'', r.boarding_code,%' then raise exception 'carry_the_clock: gangway payload anchor missing'; end if;
  src := replace(src, '''starts_at'', v.starts_at, ''code'', r.boarding_code,', '''starts_at'', v.starts_at, ''time_zone'', v.time_zone, ''code'', r.boarding_code,');
  if src not like '%What the cameras kept lands in Episodes.%' then raise exception 'carry_the_clock: Docked word anchor missing'; end if;
  src := replace(src, 'Lines ashore, all well. What the cameras kept lands in Episodes.', 'Lines ashore, all well. What the week kept lands in the Log.');
  execute src;

  -- handle_pass_aboard: the boarding pass
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_pass_aboard' and p.pronamespace = 'public'::regnamespace;
  if src not like '%jsonb_build_object(''name'', p.full_name, ''voyage'', v.title, ''starts_at'', v.starts_at,%' then raise exception 'handle_pass_aboard: payload anchor missing'; end if;
  src := replace(src, 'jsonb_build_object(''name'', p.full_name, ''voyage'', v.title, ''starts_at'', v.starts_at,', 'jsonb_build_object(''name'', p.full_name, ''voyage'', v.title, ''starts_at'', v.starts_at, ''time_zone'', v.time_zone,');
  execute src;

  -- handle_pass_release: the waitlist release
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_pass_release' and p.pronamespace = 'public'::regnamespace;
  if src not like '%jsonb_build_object(''name'', nextup.full_name, ''voyage'', v.title, ''starts_at'', v.starts_at,%' then raise exception 'handle_pass_release: payload anchor missing'; end if;
  src := replace(src, 'jsonb_build_object(''name'', nextup.full_name, ''voyage'', v.title, ''starts_at'', v.starts_at,', 'jsonb_build_object(''name'', nextup.full_name, ''voyage'', v.title, ''starts_at'', v.starts_at, ''time_zone'', v.time_zone,');
  execute src;

  -- handle_episode_status: the weather hold letter, and the cancellation text
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_episode_status' and p.pronamespace = 'public'::regnamespace;
  if src not like '%''weather-hold'', jsonb_build_object(''name'', r.full_name, ''voyage'', new.title, ''starts_at'', new.starts_at));%' then raise exception 'handle_episode_status: weather payload anchor missing'; end if;
  src := replace(src, '''weather-hold'', jsonb_build_object(''name'', r.full_name, ''voyage'', new.title, ''starts_at'', new.starts_at));', '''weather-hold'', jsonb_build_object(''name'', r.full_name, ''voyage'', new.title, ''starts_at'', new.starts_at, ''time_zone'', new.time_zone));');
  if exists (select 1 from public.sms_templates where code = 'voyage-cancelled') then
    if src not like '%values (r.phone, ''weather-hold'',
                jsonb_build_object(''title'', ''Cancelled: ''%' then raise exception 'handle_episode_status: cancel SMS anchor missing'; end if;
    src := replace(src, 'values (r.phone, ''weather-hold'',
                jsonb_build_object(''title'', ''Cancelled: ''', 'values (r.phone, ''voyage-cancelled'',
                jsonb_build_object(''title'', ''Cancelled: ''');
  end if;
  execute src;

  -- the applicant letters greet by name
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_new_crew_candidate' and p.pronamespace = 'public'::regnamespace;
  if src like '%jsonb_build_object(''role'', (select title from public.crew_roles where id = new.role_id))%' then
    src := replace(src, 'jsonb_build_object(''role'', (select title from public.crew_roles where id = new.role_id))', 'jsonb_build_object(''name'', new.full_name, ''role'', (select title from public.crew_roles where id = new.role_id))');
    execute src;
  end if;
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_new_application' and p.pronamespace = 'public'::regnamespace;
  if src like '%''application-received'', ''{}''::jsonb%' then
    src := replace(src, '''application-received'', ''{}''::jsonb', '''application-received'', jsonb_build_object(''name'', new.full_name)');
    execute src;
  elsif src like '%''application-received'', ''{}''%' then
    src := replace(src, '''application-received'', ''{}''', '''application-received'', jsonb_build_object(''name'', new.full_name)');
    execute src;
  end if;

  -- the invitation queues under its living name
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'set_application_status' and p.pronamespace = 'public'::regnamespace;
  if src not like '%''salon-invite''%' then raise exception 'set_application_status: salon-invite anchor missing'; end if;
  src := replace(src, '''salon-invite''', '''port-invite''');
  execute src;

  -- queue_email asks the registry, the way run_automations already does
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'queue_email' and p.pronamespace = 'public'::regnamespace;
  if src not like '%if coalesce(btrim(p_template), '''') = '''' then raise exception ''an email needs a template''; end if;%' then raise exception 'queue_email: anchor missing'; end if;
  src := replace(src, 'if coalesce(btrim(p_template), '''') = '''' then raise exception ''an email needs a template''; end if;',
    'if coalesce(btrim(p_template), '''') = '''' then raise exception ''an email needs a template''; end if;
  if not exists (select 1 from public.email_templates t where t.code = btrim(p_template) and t.active) then
    raise exception ''no such letter: %'', p_template;
  end if;');
  execute src;
end $$;

-- What the provider tells us about an address: a hard bounce or a complaint
-- takes it off the list. Read by send-outbox before a batch; written only by
-- the resend-events function with the service role.
create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null,
  source text not null default 'resend',
  provider_event_id text,
  recorded_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
create policy "the bridge reads suppressions" on public.email_suppressions
  for select to authenticated using (public.is_staff());
grant select on public.email_suppressions to authenticated;;
