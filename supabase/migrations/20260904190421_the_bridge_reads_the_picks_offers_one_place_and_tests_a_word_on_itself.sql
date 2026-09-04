-- Three handoffs from the Bridge build.
--
-- The Tonight console reads "sit near again" picks and table_picks had only
-- the picker's own policy, so the hints read empty for staff.
create policy "staff read picks" on public.table_picks
  for select to authenticated using (public.is_staff());

-- The composition console offers a place to a named request, not only to the
-- next in line. Same checks as offer_the_next_place, aimed at one row.
create or replace function public.offer_this_place(p_entry uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e record;
  ceiling integer;
  units integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select * into e from public.waitlist_entries where id = p_entry;
  if e.id is null then raise exception 'no such request'; end if;
  if e.claimed_at is not null or e.released_at is not null then raise exception 'that request is no longer open'; end if;
  if e.offered_at is not null and e.claim_expires_at > now() then raise exception 'that place is already offered'; end if;

  perform pg_advisory_xact_lock(hashtext('waitlist:' || e.episode_id::text || ':' || e.segment));
  perform public.lapse_stale_waitlist_offers(e.episode_id, e.segment);

  select cap into ceiling from public.episode_segment_caps where episode_id = e.episode_id and segment = e.segment;
  if ceiling is null then raise exception 'this episode does not seat that segment'; end if;
  select count(*) into units from public.passes where episode_id = e.episode_id and status = 'aboard' and segment = e.segment;
  if units >= ceiling then raise exception '% seats, % taken — there is nothing to offer', ceiling, units; end if;
  if public.passes_left(e.episode_id) < public.segment_heads(e.segment) then
    raise exception 'the segment has a place but the hull is full — nothing to offer until a pass is released';
  end if;

  update public.waitlist_entries
     set offered_at = now(), claim_expires_at = now() + make_interval(hours => public.club_setting('waitlist_claim_hours'))
   where id = e.id;

  insert into public.notifications (profile_id, kind, title, body, episode_id, href)
  values (e.profile_id, 'word', 'A place is yours',
          'The Bridge has a place for you, held for ' || public.club_setting('waitlist_claim_hours') || ' hours. Claim it on your passes.',
          e.episode_id, '/passes');
  return e.id;
end $function$;
revoke all on function public.offer_this_place(uuid) from public, anon;
grant execute on function public.offer_this_place(uuid) to authenticated;

-- A broadcast may be aimed at one member — which is how an operator sends
-- themselves the test, through the same path the audience will get.
create or replace function public.perform_broadcast(p_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b record;
  v_kind text; v_id uuid; v_tier text;
  v_n integer := 0;
  r record;
begin
  select * into b from public.broadcasts where id = p_id for update;
  if b.id is null then raise exception 'no such broadcast'; end if;
  if b.status = 'sent' then return b.recipients; end if;

  v_kind := b.audience->>'kind';
  v_id   := nullif(b.audience->>'id', '')::uuid;
  v_tier := b.audience->>'tier';

  for r in
    select p.id, p.email, p.full_name, case when p.phone_verified then p.phone end as phone
      from public.profiles p
     where case v_kind
             when 'all'     then p.status = 'active'
             when 'member'  then p.id = v_id
             when 'city'    then p.status = 'active' and p.home_city = v_id
             when 'tier'    then p.status = 'active' and p.tier::text = v_tier
             when 'lapsed'  then p.status = 'paused' and p.hold_reason = 'dues'
             when 'episode' then exists (select 1 from public.passes x
                                          where x.profile_id = p.id and x.episode_id = v_id and x.status = 'aboard')
           end
  loop
    if 'notice' = any(b.channels) then
      insert into public.notifications (profile_id, kind, title, body, episode_id, href)
      values (r.id, 'word', b.title, b.body, case when v_kind = 'episode' then v_id end,
              case when v_kind = 'episode' then '/passes' else '/inbox' end);
    elsif 'push' = any(b.channels) then
      insert into public.push_outbox (profile_id, title, body, url)
      values (r.id, b.title, b.body, case when v_kind = 'episode' then '/passes' else '/inbox' end);
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

create or replace function public.send_broadcast(
  p_audience jsonb, p_title text, p_body text, p_channels text[], p_send_at timestamptz default null
)
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
begin
  if not public.is_staff() then raise exception 'the bridge speaks; members do not'; end if;
  if v_kind not in ('all','city','tier','episode','lapsed','member') then raise exception 'no such audience'; end if;
  if length(coalesce(p_title, '')) between 1 and 120 is not true then raise exception 'a title is one line'; end if;
  if length(coalesce(p_body, '')) between 1 and 2000 is not true then raise exception 'the word is up to two thousand characters'; end if;
  if not (p_channels && array['notice','email','push','sms']) then raise exception 'pick a channel'; end if;
  if v_kind in ('city','episode','member') and v_id is null then raise exception 'that audience needs an id'; end if;
  /* A single-member word is the operator's own test; the Bridge does not
     write to one member this way — a word to one person is notify_member. */
  if v_kind = 'member' and v_id <> auth.uid() then raise exception 'a test goes to yourself'; end if;
  if v_kind = 'tier' and v_tier not in ('regional','national','global') then raise exception 'no such tier'; end if;
  if p_send_at is not null and p_send_at > now() + interval '90 days' then raise exception 'a word is scheduled inside ninety days'; end if;

  insert into public.broadcasts (sent_by, audience, title, body, channels, recipients, send_at, status)
  values (auth.uid(), p_audience, p_title, p_body, p_channels, 0, p_send_at, 'queued')
  returning id into v_bid;

  if p_send_at is not null and p_send_at > now() then return 0; end if;
  return public.perform_broadcast(v_bid);
end $function$;
revoke all on function public.send_broadcast(jsonb, text, text, text[], timestamptz) from public, anon;
grant execute on function public.send_broadcast(jsonb, text, text, text[], timestamptz) to authenticated;;
