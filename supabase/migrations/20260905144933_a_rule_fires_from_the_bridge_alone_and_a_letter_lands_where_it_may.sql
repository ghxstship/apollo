-- Seven findings of the comms tests, each a way a word could reach the wrong
-- person, fail to reach the right one, or be fired by anyone at all.
--
-- 1. run_automations is SECURITY DEFINER with no staff check, and EXECUTE was
--    granted to anon and authenticated: anyone holding the publishable key
--    could fire every live rule at any member. The triggers and the
--    five-minute clock call it as the owner and need no grant. The one
--    legitimate outside caller — the Bridge firing a single rule at a member
--    to see it land — gets a staff-only wrapper.
revoke execute on function public.run_automations(text, uuid, uuid, uuid, boolean) from public, anon, authenticated;

create or replace function public.run_automation_now(p_only uuid, p_profile_id uuid default null, p_episode_id uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_event text;
begin
  if not public.is_staff() then
    raise exception 'the Bridge fires a rule by hand; nobody else does';
  end if;
  select trigger_event into v_event from public.automations where id = p_only;
  if v_event is null then
    raise exception 'no such rule';
  end if;
  return public.run_automations(v_event, coalesce(p_profile_id, auth.uid()), p_episode_id, p_only, true);
end $function$;
revoke all on function public.run_automation_now(uuid, uuid, uuid) from public, anon;
grant execute on function public.run_automation_now(uuid, uuid, uuid) to authenticated, service_role;

-- 2. handle_pass_release wrote the waitlist-release LETTER inside the berths
--    notice switch. A member who had turned that notice off was promoted from
--    the waitlist, charged, and never told: no notice by their choice, and no
--    letter by ours. The switch silences the notice alone; the letter with the
--    boarding code goes regardless, as a receipt does.
do $$
declare src text; a1 text; a2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_pass_release' and p.pronamespace = 'public'::regnamespace;
  a1 := E'release it within 48 hours if the tide has turned.''\n          from public.episodes v where v.id = old.episode_id;\n\n          select r.boarding_code into promoted';
  a2 := E'from public.episodes v where v.id = old.episode_id and nextup.email is not null;\n        end if;\n        exit;';
  if position(a1 in src) = 0 or position(a2 in src) = 0 then
    raise exception 'handle_pass_release: anchor missing — re-read before patching';
  end if;
  src := replace(src, a1, E'release it within 48 hours if the tide has turned.''\n          from public.episodes v where v.id = old.episode_id;\n        end if;\n\n        select r.boarding_code into promoted');
  src := replace(src, a2, E'from public.episodes v where v.id = old.episode_id and nextup.email is not null;\n        exit;');
  execute src;
end $$;

-- 3. A rule's letter carries the member's name and the episode's title and
--    nothing else. A letter that REQUIRES more — a boarding code, an amount,
--    a season, an operator's title and body — was accepted by the dispatcher,
--    queued, and refused by the sender at drain time, a day late. The
--    registry now says which letters a rule may send, and the dispatcher
--    asks before it queues.
alter table public.email_templates add column if not exists rule_can_send boolean not null default true;
comment on column public.email_templates.rule_can_send is
  'Whether an automation may send this letter with only the member and the episode in hand. False for a letter whose required keys (code, amount, season, an operator''s words) no rule carries.';
update public.email_templates set rule_can_send = false
 where code in ('boarding-pass', 'gangway-details', 'refund-posted', 'season-card', 'bridge-word');

do $$
declare src text; a1 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'run_automations' and p.pronamespace = 'public'::regnamespace;
  a1 := 'select 1 from public.email_templates t where t.code = v_code and t.active';
  if position(a1 in src) = 0 then
    raise exception 'run_automations: anchor missing — re-read before patching';
  end if;
  src := replace(src, a1, 'select 1 from public.email_templates t where t.code = v_code and t.active and t.rule_can_send');
  execute src;
end $$;

-- 4. An address the provider bounced or that unsubscribed sits in
--    email_suppressions, and nothing between a writer and the outbox read it:
--    the row was queued and the sender did the refusing. Skipped at the door
--    instead, with the reason, the way a fixture address is.
create or replace function public.a_suppressed_address_gets_no_mail()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare why text;
begin
  select s.reason into why from public.email_suppressions s where lower(s.email) = lower(coalesce(new.to_email, '')) limit 1;
  if found then
    new.status := 'skipped';
    new.last_error := coalesce(new.last_error, 'address suppressed — ' || coalesce(why, 'no reason recorded'));
  end if;
  return new;
end $function$;
revoke all on function public.a_suppressed_address_gets_no_mail() from public, anon, authenticated;
drop trigger if exists a_suppressed_address_gets_no_mail on public.email_outbox;
create trigger a_suppressed_address_gets_no_mail
  before insert on public.email_outbox
  for each row execute function public.a_suppressed_address_gets_no_mail();

-- 5. The text guard overwrote an earlier reason; the mail guard keeps one.
create or replace function public.no_real_texts_to_a_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare digits text := regexp_replace(coalesce(new.to_phone, ''), '[^0-9]', '', 'g');
begin
  if new.to_phone is null
     or length(digits) < 8
     -- 555-0100..555-0199, reserved for fiction in any area code
     or digits ~ '555010[0-9]'
     -- the 555 exchange generally, which no real subscriber holds
     or digits ~ '^1?[0-9]{3}555[0-9]{4}$'
     or new.to_phone like '+1500555%'
  then
    new.status := 'skipped';
    new.last_error := coalesce(new.last_error, 'fixture number — not sent');
  end if;
  return new;
end;
$function$;

-- 6. A broadcast sent on push alone reached a member who had turned push
--    off: fan_out honours channels.push for a notice, but the push-alone
--    branch wrote to push_outbox directly. The member's switch applies.
do $$
declare src text; a1 text; a2 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'perform_broadcast' and p.pronamespace = 'public'::regnamespace;
  a1 := 'select p.id, p.email, p.full_name, case when p.phone_verified then p.phone end as phone';
  a2 := E'elsif ''push'' = any(b.channels) then\n      insert into public.push_outbox';
  if position(a1 in src) = 0 or position(a2 in src) = 0 then
    raise exception 'perform_broadcast: anchor missing — re-read before patching';
  end if;
  src := replace(src, a1, 'select p.id, p.email, p.full_name, p.notification_prefs, case when p.phone_verified then p.phone end as phone');
  src := replace(src, a2, E'elsif ''push'' = any(b.channels)\n          and coalesce((r.notification_prefs->''channels''->>''push'')::boolean, true) then\n      insert into public.push_outbox');
  execute src;
end $$;

-- 7. weather-hold and voyage-cancelled texts read the carrier's {sailing}
--    from the payload's title — "Weather hold: X" — so the text read
--    "Weather hold: X is held for weather". Every writer of those two texts
--    now supplies `sailing` as the bare title; the map reads it.
update public.sms_templates
   set parameter_map = parameter_map || '{"sailing": "sailing"}'::jsonb
 where code in ('weather-hold', 'voyage-cancelled')
   and parameter_map->>'sailing' = 'title';;
