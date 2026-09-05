-- The last-mile recommendations that live in the database.

-- 1. The inbox could only grow: no DELETE policy, no retention. A member
--    archives what they have read; the Bridge strikes a word (and the test
--    sweep's fixture notices, which used to be silent no-ops); the nightly
--    purge takes read notices past the dial once their episode is over.
insert into public.club_settings (key, value_int, note)
values ('notice_retention_days', 180, 'Read notices older than this are purged nightly, once the episode they name has ended.')
on conflict (key) do nothing;

grant delete on public.notifications to authenticated;
drop policy if exists "a member archives what they have read" on public.notifications;
create policy "a member archives what they have read" on public.notifications
  for delete using (profile_id = auth.uid() and read);
drop policy if exists "the Bridge strikes a word" on public.notifications;
create policy "the Bridge strikes a word" on public.notifications
  for delete using (public.is_staff());

create or replace function public.cron_purge_expired_records()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare keep interval := make_interval(days => public.club_setting('outbox_retention_days'));
        keep_notices interval := make_interval(days => coalesce(public.club_setting('notice_retention_days'), 180));
begin
  perform public.purge_expired_signatures_unattended(public.club_setting('signature_retention_years'));
  perform public.purge_spent_identity_unattended();
  update public.counter_signatures
     set signed_ip = null, user_agent = null
   where signed_at < now() - make_interval(years => public.club_setting('signature_retention_years'))
     and (signed_ip is not null or user_agent is not null);
  delete from public.email_outbox where status <> 'pending' and created_at < now() - keep;
  delete from public.sms_outbox   where status <> 'pending' and created_at < now() - keep;
  delete from public.push_outbox  where status <> 'pending' and created_at < now() - keep;
  /* Read, old, and about nothing still to come. */
  delete from public.notifications n
   where n.read
     and n.created_at < now() - keep_notices
     and (n.episode_id is null or exists (
           select 1 from public.episodes e
            where e.id = n.episode_id
              and (e.status in ('completed', 'cancelled') or coalesce(e.ends_at, e.starts_at + interval '12 hours') < now())));
  perform public.erase_departed_profiles();
end $function$;

-- 2. Weather is one preference on every channel. The weather-hold notice
--    honoured the member's weather category; the text read only the sms
--    channel switch. The same category gates both.
do $$
declare src text; a1 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'handle_episode_status' and p.pronamespace = 'public'::regnamespace;
  a1 := E'      if r.phone is not null and r.phone_verified then\n        insert into public.sms_outbox (to_phone, template, payload)\n        values (r.phone, ''weather-hold'',';
  if position(a1 in src) = 0 then raise exception 'handle_episode_status: anchor missing — re-read before patching'; end if;
  src := replace(src, a1, E'      if r.phone is not null and r.phone_verified\n         and coalesce((r.notification_prefs->>''weather'')::boolean, true) then\n        insert into public.sms_outbox (to_phone, template, payload)\n        values (r.phone, ''weather-hold'',');
  execute src;
end $$;

-- 3. The clock: legs and a second clock in the boarding letter, a standby word
--    at T-2h, and the crew's call time on the crew's own phone at T-24h.
do $$
declare src text; a1 text; a2 text; a3 text; a4 text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'carry_the_clock' and p.pronamespace = 'public'::regnamespace;
  a1 := E'''muster'', coalesce(v.muster, ''Gangway B-12'')));\n        sent := sent + 1;';
  a2 := 'for r in select p.id pid from public.passes rv join public.profiles p on p.id = rv.profile_id';
  a3 := '''Riviera Chic, sun up, phones down. The water is waiting.''';
  a4 := E'  return sent;\nend $function$';
  if position(a1 in src) = 0 or position(a2 in src) = 0 or position(a3 in src) = 0 or position(a4 in src) = 0 then
    raise exception 'carry_the_clock: anchor missing — re-read before patching';
  end if;
  /* Legs, when the episode has them, and the member's home clock when it
     differs from the episode's. Nulls are stripped so the sender's REQUIRES
     check reads the same payload it always did. */
  src := replace(src, a1,
    E'''muster'', coalesce(v.muster, ''Gangway B-12''),\n' ||
    E'                                   ''legs'', (select jsonb_agg(jsonb_build_object(''day'', l.day, ''place'', l.place, ''starts_at'', l.starts_at) order by l.day, l.starts_at)\n' ||
    E'                                              from public.episode_legs l where l.episode_id = v.id and coalesce(l.status, '''') <> ''cancelled''),\n' ||
    E'                                   ''home_time_zone'', (select c.time_zone from public.profiles pp join public.cities c on c.id = pp.home_city\n' ||
    E'                                                        where pp.id = r.pid and c.time_zone is not null and c.time_zone is distinct from v.time_zone)));\n' ||
    E'        sent := sent + 1;');
  src := replace(src, a2, 'for r in select p.id pid, coalesce(rv.standby, false) as standby from public.passes rv join public.profiles p on p.id = rv.profile_id');
  src := replace(src, a3,
    'case when r.standby then ''You hold a standby pass. Come to the muster at call time and wait by the gangway — you board into the first seat a no-show frees.'' else ''Riviera Chic, sun up, phones down. The water is waiting.'' end');
  /* T-24h: the crew's call, as a text, once per assignment. */
  src := replace(src, a4,
    E'  -- T-24h: the crew call, on the crew''s own phone, once.\n' ||
    E'  for v in select * from public.episodes\n' ||
    E'           where status in (''scheduled'',''live'')\n' ||
    E'             and starts_at - interval ''24 hours'' <= now() and starts_at > now() loop\n' ||
    E'    for r in select a.id aid, a.call_time, p.phone\n' ||
    E'             from public.crew_assignments a\n' ||
    E'             join public.crew c on c.id = a.crew_id\n' ||
    E'             join public.profiles p on p.id = c.profile_id\n' ||
    E'             where a.episode_id = v.id\n' ||
    E'               and coalesce(a.status, '''') not in (''declined'', ''cancelled'', ''struck'')\n' ||
    E'               and p.phone is not null and p.phone_verified loop\n' ||
    E'      if not exists (select 1 from public.sms_outbox s\n' ||
    E'                      where s.template = ''crew-call-time'' and s.payload->>''assignment_id'' = r.aid::text) then\n' ||
    E'        insert into public.sms_outbox (to_phone, template, payload)\n' ||
    E'        values (r.phone, ''crew-call-time'',\n' ||
    E'                jsonb_build_object(''title'', v.title, ''sailing'', v.title,\n' ||
    E'                                   ''muster'', coalesce(v.muster, ''Gangway B-12''),\n' ||
    E'                                   ''call_time'', to_char(coalesce(r.call_time, v.starts_at - interval ''90 minutes'') at time zone coalesce(v.time_zone, ''America/New_York''), ''HH24:MI''),\n' ||
    E'                                   ''assignment_id'', r.aid, ''episode_id'', v.id));\n' ||
    E'        sent := sent + 1;\n' ||
    E'      end if;\n' ||
    E'    end loop;\n' ||
    E'  end loop;\n\n' ||
    E'  return sent;\nend $function$');
  execute src;
end $$;

-- 4. The outbox as a queue the Bridge can work: retry (status back to pending,
--    next attempt now) and strike. Column-level UPDATE so nothing else on a
--    row moves by hand.
grant update (status, next_attempt_at) on public.email_outbox to authenticated;
grant update (status, next_attempt_at) on public.sms_outbox to authenticated;
grant update (status, next_attempt_at) on public.push_outbox to authenticated;
grant delete on public.email_outbox, public.sms_outbox, public.push_outbox to authenticated;
drop policy if exists "the Bridge works the outbox" on public.email_outbox;
create policy "the Bridge works the outbox" on public.email_outbox for update using (public.is_staff()) with check (public.is_staff() and status in ('pending', 'skipped', 'failed'));
drop policy if exists "the Bridge strikes a letter" on public.email_outbox;
create policy "the Bridge strikes a letter" on public.email_outbox for delete using (public.is_staff() and status <> 'sending');
drop policy if exists "the Bridge works the outbox" on public.sms_outbox;
create policy "the Bridge works the outbox" on public.sms_outbox for update using (public.is_staff()) with check (public.is_staff() and status in ('pending', 'skipped', 'failed'));
drop policy if exists "the Bridge strikes a text" on public.sms_outbox;
create policy "the Bridge strikes a text" on public.sms_outbox for delete using (public.is_staff() and status <> 'sending');
drop policy if exists "the Bridge works the outbox" on public.push_outbox;
create policy "the Bridge works the outbox" on public.push_outbox for update using (public.is_staff()) with check (public.is_staff() and status in ('pending', 'skipped', 'failed'));
drop policy if exists "the Bridge strikes a push" on public.push_outbox;
create policy "the Bridge strikes a push" on public.push_outbox for delete using (public.is_staff() and status <> 'sending');

-- 5. One search across the Bridge. Staff only; every row carries the door it
--    opens. The pattern is escaped so a typed % or _ is a character.
create or replace function public.bridge_search(p_q text)
returns table(kind text, id text, title text, subtitle text, href text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare q text := '%' || replace(replace(replace(btrim(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if char_length(btrim(coalesce(p_q, ''))) < 2 then return; end if;
  return query
  (select 'member'::text, p.id::text, coalesce(p.full_name, 'A member'), coalesce(p.member_no, '') || case when p.email is not null then ' · ' || p.email else '' end, '/bridge/members?q=' || replace(coalesce(p.member_no, p.email, p.full_name, ''), ' ', '%20')
     from public.profiles p
    where p.full_name ilike q or p.email ilike q or p.member_no ilike q or p.handle ilike q
    order by p.status = 'active' desc, p.full_name limit 6)
  union all
  (select 'episode'::text, e.id::text, e.title, to_char(e.starts_at at time zone coalesce(e.time_zone, 'America/New_York'), 'Dy DD Mon HH24:MI') || ' · ' || e.status::text, '/bridge/episodes?q=' || e.slug
     from public.episodes e
    where e.title ilike q or e.slug ilike q
    order by e.starts_at desc limit 6)
  union all
  (select 'code'::text, c.code, c.code, c.kind || ' · ' || c.uses || '/' || c.max_uses || case when c.active then '' else ' · off' end, '/bridge/codes?q=' || c.code
     from public.promo_codes c
    where c.code ilike q
    order by c.created_at desc limit 4)
  union all
  (select 'application'::text, a.id::text, a.full_name, a.status || ' · ' || a.email, '/bridge?q=' || replace(a.email, ' ', '%20')
     from public.applications a
    where a.full_name ilike q or a.email ilike q
    order by a.created_at desc limit 4)
  union all
  (select 'crew'::text, cc.id::text, cc.full_name, coalesce(cc.stage, '') || ' · ' || cc.email, '/bridge/crew?q=' || replace(cc.email, ' ', '%20')
     from public.crew_candidates cc
    where cc.full_name ilike q or cc.email ilike q
    order by cc.created_at desc limit 4);
end $function$;
revoke all on function public.bridge_search(text) from public, anon;
grant execute on function public.bridge_search(text) to authenticated, service_role;

-- 6. Every letter, seen by the operator before a member sees it. Queues the
--    named letter to the CALLER's own address with a sample payload that
--    fills every key any letter reads; the sender renders it as it would for a
--    member. Staff only; the address is never a parameter.
create or replace function public.send_letter_to_me(p_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_email text; v_name text; v_id uuid; v_sample jsonb;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if not exists (select 1 from public.email_templates t where t.code = p_code and t.active) then
    raise exception 'no such letter in the registry';
  end if;
  select p.email, p.full_name into v_email, v_name from public.profiles p where p.id = auth.uid();
  if v_email is null then raise exception 'your profile has no address to send to'; end if;
  v_sample := jsonb_build_object(
    'preview', true,
    'name', coalesce(v_name, 'Skipper'),
    'voyage', 'The long way home', 'episode', 'The long way home', 'title', 'A word from the Bridge',
    'body', 'This is what the letter looks like when it lands. Nothing in it is real.',
    'starts_at', (now() + interval '3 days')::text, 'time_zone', 'America/New_York',
    'code', 'UN-PREVIEW-01', 'muster', 'Dock C, Dinner Key Marina', 'vessel', 'Sea Breeze',
    'amount', '$120.00', 'season', 'Season I', 'tier', 'National', 'role', 'Deckhand',
    'days', 7, 'link', 'https://unhingedsocial.us/passes', 'slug', 'the-long-way-home',
    'member', coalesce(v_name, 'Skipper'), 'hours', 6, 'city', 'Miami');
  insert into public.email_outbox (to_email, template, payload) values (v_email, p_code, v_sample) returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.send_letter_to_me(text) from public, anon;
grant execute on function public.send_letter_to_me(text) to authenticated, service_role;

-- 7. The guest's night card: after signing, the same token reads the hour,
--    the muster, the host's first name and the guest's own code. The venue's
--    name comes too — the guest is coming.
drop function if exists public.guest_document(uuid, text);
create function public.guest_document(p_token uuid, p_document_code text)
returns table(guest_name text, voyage_title text, voyage_starts timestamptz, voyage_time_zone text, document_title text, body text, already_signed boolean, voyage_state text,
              guest_code text, muster text, host_first text, venue_name text, dress_line text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  g   record;
  ver uuid;
  v_state text;
begin
  select rg.id, rg.name, rg.boarding_code, v.setting, v.title, v.starts_at, v.time_zone, v.muster, v.conditions,
         v.status::text as vstatus,
         split_part(coalesce(hp.full_name, ''), ' ', 1) as host_first,
         (select vn.name from public.venues vn where vn.id = v.venue_id) as venue_name
  into g
  from public.pass_guests rg
  join public.passes r on r.id = rg.rsvp_id
  join public.profiles hp on hp.id = r.profile_id
  join public.episodes v on v.id = r.episode_id
  where rg.sign_token = p_token;
  if not found then return; end if;

  -- A guest token opens guest paper only.
  if not exists (
    select 1 from public.documents d
    where d.code = p_document_code and d.audience = 'guest' and d.active
  ) then
    return;
  end if;

  ver := public.published_version(p_document_code);
  if ver is null then return; end if;

  v_state := case
    when g.vstatus = 'cancelled' then 'cancelled'
    when g.vstatus = 'completed' or g.starts_at <= now() then 'sailed'
    else 'ahead'
  end;

  return query
  select g.name, g.title, g.starts_at, g.time_zone,
         d.title,
         public.render_document(ver, jsonb_build_object('setting', g.setting)),
         exists (select 1 from public.signatures s
                 where s.document_version_id = ver and s.guest_id = g.id),
         v_state,
         g.boarding_code, coalesce(g.muster, 'Gangway B-12'), nullif(g.host_first, ''), g.venue_name,
         case when g.setting::text = 'sea' then 'Riviera Chic, sun up, phones down. Soft soles and something warm.' else 'Riviera Chic, phones down.' end
  from public.documents d where d.code = p_document_code;
end;
$function$;
revoke all on function public.guest_document(uuid, text) from public;
grant execute on function public.guest_document(uuid, text) to anon, authenticated, service_role;;
