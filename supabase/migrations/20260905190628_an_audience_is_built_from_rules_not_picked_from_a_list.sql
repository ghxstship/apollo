-- A broadcast's audience was one of five kinds off a list. It is now a set of
-- rules — standing, tier, plan, city, league, held for dues, aboard or
-- waitlisted on an episode, a verified phone, joined before or after a date,
-- knots or nights sailed above or below a figure, an upcoming pass, on camera,
-- in the directory — matched all or any, each rule negatable, up to twelve.
-- The five old kinds still resolve, as rules, so nothing already recorded
-- changes meaning.

/* The resolver. No caller check: perform_broadcast runs from the clock with
   no auth.uid(); the staff-facing preview below checks and delegates. Not
   granted to anyone. */
create or replace function public.resolve_broadcast_audience(p_audience jsonb)
returns setof uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_kind text := p_audience->>'kind';
  v_id text := p_audience->>'id';
  rules jsonb;
  v_match text;
  acc uuid[];
  sel uuid[];
  r jsonb; f text; op text; val jsonb; neg boolean; first boolean := true;
  n numeric; b boolean; at timestamptz;
begin
  if v_kind = 'member' then
    return query select p.id from public.profiles p where p.id = v_id::uuid;
    return;
  end if;
  case v_kind
    when 'all' then rules := '[{"field":"standing","op":"in","value":["active"]}]'::jsonb;
    when 'lapsed' then rules := '[{"field":"held_for_dues","op":"is","value":true}]'::jsonb;
    when 'city' then rules := jsonb_build_array(
      '{"field":"standing","op":"in","value":["active"]}'::jsonb,
      jsonb_build_object('field', 'city', 'op', 'in', 'value', jsonb_build_array(v_id)));
    when 'tier' then rules := jsonb_build_array(
      '{"field":"standing","op":"in","value":["active"]}'::jsonb,
      jsonb_build_object('field', 'tier', 'op', 'in', 'value', jsonb_build_array(p_audience->>'tier')));
    when 'episode' then rules := jsonb_build_array(jsonb_build_object('field', 'aboard', 'op', 'in', 'value', jsonb_build_array(v_id)));
    when 'filter' then rules := coalesce(p_audience->'rules', '[]'::jsonb);
    else raise exception 'no such audience';
  end case;
  v_match := coalesce(p_audience->>'match', 'all');
  if v_match not in ('all', 'any') then raise exception 'an audience matches all of its rules, or any'; end if;
  if jsonb_typeof(rules) <> 'array' or jsonb_array_length(rules) < 1 or jsonb_array_length(rules) > 12 then
    raise exception 'an audience is one to twelve rules';
  end if;

  for r in select * from jsonb_array_elements(rules) loop
    f := r->>'field'; op := coalesce(r->>'op', 'in'); val := r->'value'; neg := coalesce((r->>'not')::boolean, false);
    if f in ('standing', 'tier', 'plan', 'city', 'league', 'aboard', 'waitlisted') then
      if jsonb_typeof(val) <> 'array' or jsonb_array_length(val) = 0 then raise exception 'the % rule needs at least one value', f; end if;
    end if;
    if f = 'standing' then
      sel := array(select p.id from public.profiles p where p.status::text in (select jsonb_array_elements_text(val)));
    elsif f = 'tier' then
      sel := array(select p.id from public.profiles p where p.tier::text in (select jsonb_array_elements_text(val)));
    elsif f = 'plan' then
      sel := array(select p.id from public.profiles p where p.plan_id::text in (select jsonb_array_elements_text(val)));
    elsif f = 'city' then
      sel := array(select p.id from public.profiles p where p.home_city::text in (select jsonb_array_elements_text(val)));
    elsif f = 'league' then
      sel := array(select m.profile_id from public.member_league m where m.league::text in (select jsonb_array_elements_text(val)));
    elsif f = 'held_for_dues' then
      b := coalesce((val#>>'{}')::boolean, true);
      sel := array(select p.id from public.profiles p where ((p.status = 'paused' and p.hold_reason = 'dues') = b));
    elsif f = 'phone_verified' then
      b := coalesce((val#>>'{}')::boolean, true);
      sel := array(select p.id from public.profiles p where coalesce(p.phone_verified, false) = b);
    elsif f = 'on_camera' then
      b := coalesce((val#>>'{}')::boolean, true);
      sel := array(select p.id from public.profiles p where coalesce(p.on_camera, false) = b);
    elsif f = 'in_directory' then
      b := coalesce((val#>>'{}')::boolean, true);
      sel := array(select p.id from public.profiles p where coalesce(p.in_directory, false) = b);
    elsif f = 'aboard' then
      sel := array(select distinct x.profile_id from public.passes x where x.status = 'aboard' and x.episode_id::text in (select jsonb_array_elements_text(val)));
    elsif f = 'waitlisted' then
      sel := array(select distinct x.profile_id from public.passes x where x.status = 'waitlist' and x.episode_id::text in (select jsonb_array_elements_text(val)));
    elsif f = 'upcoming_pass' then
      b := coalesce((val#>>'{}')::boolean, true);
      sel := array(select p.id from public.profiles p where exists (
        select 1 from public.passes x join public.episodes e on e.id = x.episode_id
         where x.profile_id = p.id and x.status = 'aboard' and e.starts_at > now() and e.status in ('scheduled', 'live', 'weather_hold')) = b);
    elsif f = 'joined' then
      at := (val#>>'{}')::timestamptz;
      if at is null then raise exception 'the joined rule needs a date'; end if;
      if op = 'before' then sel := array(select p.id from public.profiles p where p.joined_at < at);
      else sel := array(select p.id from public.profiles p where p.joined_at >= at); end if;
    elsif f = 'knots' then
      n := (val#>>'{}')::numeric;
      if n is null then raise exception 'the knots rule needs a figure'; end if;
      if op = 'lte' then sel := array(select p.id from public.profiles p where (select coalesce(sum(k.delta), 0) from public.knots_ledger k where k.profile_id = p.id) <= n);
      else sel := array(select p.id from public.profiles p where (select coalesce(sum(k.delta), 0) from public.knots_ledger k where k.profile_id = p.id) >= n); end if;
    elsif f = 'nights' then
      n := (val#>>'{}')::numeric;
      if n is null then raise exception 'the nights rule needs a figure'; end if;
      if op = 'lte' then sel := array(select p.id from public.profiles p where (select count(*) from public.passes x join public.episodes e on e.id = x.episode_id where x.profile_id = p.id and x.status = 'aboard' and e.status = 'completed') <= n);
      else sel := array(select p.id from public.profiles p where (select count(*) from public.passes x join public.episodes e on e.id = x.episode_id where x.profile_id = p.id and x.status = 'aboard' and e.status = 'completed') >= n); end if;
    else
      raise exception 'no such rule: %', coalesce(f, '(blank)');
    end if;

    if neg then sel := array(select p.id from public.profiles p except select unnest(sel)); end if;
    if first then acc := sel; first := false;
    elsif v_match = 'all' then acc := array(select unnest(acc) intersect select unnest(sel));
    else acc := array(select unnest(acc) union select unnest(sel));
    end if;
  end loop;
  return query select unnest(acc);
end $function$;
revoke all on function public.resolve_broadcast_audience(jsonb) from public, anon, authenticated;

/* The preview the builder shows as the operator types: how many, and a few
   names so the count reads as people. Staff only. */
create or replace function public.broadcast_audience_preview(p_audience jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare v_ids uuid[]; v_names text[];
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  v_ids := array(select public.resolve_broadcast_audience(p_audience));
  v_names := array(select coalesce(p.full_name, 'A member') from public.profiles p where p.id = any(v_ids) order by p.full_name limit 5);
  return jsonb_build_object('count', coalesce(array_length(v_ids, 1), 0), 'sample', to_jsonb(v_names));
end $function$;
revoke all on function public.broadcast_audience_preview(jsonb) from public, anon;
grant execute on function public.broadcast_audience_preview(jsonb) to authenticated, service_role;

/* The fan-out reads the resolver. Everything else it did stands: the notice
   (or push alone, honouring the switch), the letter, the text cut at 140. */
create or replace function public.perform_broadcast(p_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b record;
  v_kind text; v_ep uuid;
  v_n integer := 0;
  r record;
begin
  select * into b from public.broadcasts where id = p_id for update;
  if b.id is null then raise exception 'no such broadcast'; end if;
  if b.status = 'sent' then return b.recipients; end if;

  v_kind := b.audience->>'kind';
  /* The episode a notice is about: the old episode kind, or a filter with one
     aboard/waitlisted rule naming a single episode. */
  v_ep := case
    when v_kind = 'episode' then nullif(b.audience->>'id', '')::uuid
    when v_kind = 'filter' then (select nullif(rr->'value'->>0, '')::uuid from jsonb_array_elements(coalesce(b.audience->'rules', '[]'::jsonb)) rr
                                  where rr->>'field' in ('aboard', 'waitlisted') and jsonb_typeof(rr->'value') = 'array' and jsonb_array_length(rr->'value') = 1 limit 1)
    else null end;

  for r in
    select p.id, p.email, p.full_name, p.notification_prefs, case when p.phone_verified then p.phone end as phone
      from public.profiles p
     where p.id in (select public.resolve_broadcast_audience(b.audience))
  loop
    if 'notice' = any(b.channels) then
      insert into public.notifications (profile_id, kind, title, body, episode_id, href)
      values (r.id, 'word', b.title, b.body, v_ep, case when v_ep is not null then '/passes' else '/inbox' end);
    elsif 'push' = any(b.channels)
          and coalesce((r.notification_prefs->'channels'->>'push')::boolean, true) then
      insert into public.push_outbox (profile_id, title, body, url)
      values (r.id, b.title, b.body, case when v_ep is not null then '/passes' else '/inbox' end);
    end if;
    if 'email' = any(b.channels) and r.email is not null then
      insert into public.email_outbox (to_email, template, payload)
      values (r.email, 'bridge-word', jsonb_build_object('name', r.full_name, 'title', b.title, 'body', b.body));
    end if;
    if 'sms' = any(b.channels) and r.phone is not null then
      insert into public.sms_outbox (to_phone, template, payload)
      values (r.phone, 'bridge-word', jsonb_build_object('title', b.title, 'body', left(b.body, 140)));
    end if;
    v_n := v_n + 1;
  end loop;

  update public.broadcasts set status = 'sent', recipients = v_n, send_at = coalesce(send_at, now()) where id = p_id;
  return v_n;
end $function$;

/* send_broadcast admits the filter kind, and refuses a word to nobody. */
create or replace function public.send_broadcast(p_audience jsonb, p_title text, p_body text, p_channels text[], p_send_at timestamptz default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kind text := p_audience->>'kind';
  v_id   uuid := nullif(p_audience->>'id', '')::uuid;
  v_tier text := p_audience->>'tier';
  v_bid  uuid;
  v_reach integer;
begin
  if not public.is_staff() then raise exception 'the bridge speaks; members do not'; end if;
  if v_kind not in ('all','city','tier','episode','lapsed','member','filter') then raise exception 'no such audience'; end if;
  if length(coalesce(p_title, '')) between 1 and 120 is not true then raise exception 'a title is one line'; end if;
  if length(coalesce(p_body, '')) between 1 and 2000 is not true then raise exception 'the word is up to two thousand characters'; end if;
  if not (p_channels && array['notice','email','push','sms']) then raise exception 'pick a channel'; end if;
  if v_kind in ('city','episode','member') and v_id is null then raise exception 'that audience needs an id'; end if;
  if v_kind = 'member' and v_id <> auth.uid() then raise exception 'a test goes to yourself'; end if;
  if v_kind = 'tier' and v_tier not in ('regional','national','global') then raise exception 'no such tier'; end if;
  if p_send_at is not null and p_send_at > now() + interval '90 days' then raise exception 'a word is scheduled inside ninety days'; end if;
  /* The rules are checked by resolving them, and a word to nobody is refused
     now rather than recorded as a send that reached 0. */
  select count(*) into v_reach from public.resolve_broadcast_audience(p_audience);
  if v_reach = 0 then raise exception 'nobody matches that audience'; end if;

  insert into public.broadcasts (sent_by, audience, title, body, channels, recipients, send_at, status)
  values (auth.uid(), p_audience, p_title, p_body, p_channels, 0, p_send_at, 'queued')
  returning id into v_bid;

  if p_send_at is not null and p_send_at > now() then return 0; end if;
  return public.perform_broadcast(v_bid);
end $function$;;
