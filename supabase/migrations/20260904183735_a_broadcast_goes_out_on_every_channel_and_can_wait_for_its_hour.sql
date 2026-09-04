-- Broadcast was notice and email, sent now. A weather hold across a weekend
-- wants push and a text, and a season going on sale wants to go out at ten
-- in the morning, not at the moment somebody finished typing. The fan-out
-- moves into perform_broadcast; send_broadcast records the intent and either
-- performs it or leaves it queued for the five-minute clock.
insert into public.sms_templates (code, channels, parameter_map, active, note, draft_body, tier, audience, provider_template_name, variable_samples)
values ('bridge-word', array['sms'], '{"title":"title","body":"body"}'::jsonb, true,
        'A word from the Bridge to a chosen audience. The operator writes it; the text is title and body.',
        '[un]: {{title}} — {{body}}', 1, 'member', 'un_bridge_word',
        '{"title":"Saturday has moved","body":"Same hour, new door: the boathouse on 5th."}'::jsonb)
on conflict (code) do nothing;

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
      /* A notice already fans out to push; push alone is for the word that
         should not sit in the Inbox. */
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
revoke all on function public.perform_broadcast(uuid) from public, anon, authenticated;

drop function if exists public.send_broadcast(jsonb, text, text, text[]);
create or replace function public.send_broadcast(
  p_audience jsonb,
  p_title text,
  p_body text,
  p_channels text[],
  p_send_at timestamptz default null
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
  if v_kind not in ('all','city','tier','episode','lapsed') then raise exception 'no such audience'; end if;
  if length(coalesce(p_title, '')) between 1 and 120 is not true then raise exception 'a title is one line'; end if;
  if length(coalesce(p_body, '')) between 1 and 2000 is not true then raise exception 'the word is up to two thousand characters'; end if;
  if not (p_channels && array['notice','email','push','sms']) then raise exception 'pick a channel'; end if;
  if v_kind in ('city','episode') and v_id is null then raise exception 'that audience needs an id'; end if;
  if v_kind = 'tier' and v_tier not in ('regional','national','global') then raise exception 'no such tier'; end if;
  if p_send_at is not null and p_send_at > now() + interval '90 days' then raise exception 'a word is scheduled inside ninety days'; end if;

  insert into public.broadcasts (sent_by, audience, title, body, channels, recipients, send_at, status)
  values (auth.uid(), p_audience, p_title, p_body, p_channels, 0, p_send_at,
          case when p_send_at is not null and p_send_at > now() then 'queued' else 'sent' end)
  returning id into v_bid;

  if p_send_at is not null and p_send_at > now() then
    update public.broadcasts set status = 'queued' where id = v_bid;
    return 0;
  end if;
  update public.broadcasts set status = 'queued' where id = v_bid;
  return public.perform_broadcast(v_bid);
end $function$;
revoke all on function public.send_broadcast(jsonb, text, text, text[], timestamptz) from public, anon;
grant execute on function public.send_broadcast(jsonb, text, text, text[], timestamptz) to authenticated;

create or replace function public.run_due_broadcasts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b record; n integer := 0;
begin
  for b in select id from public.broadcasts where status = 'queued' and send_at is not null and send_at <= now() order by send_at loop
    perform public.perform_broadcast(b.id);
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke all on function public.run_due_broadcasts() from public, anon, authenticated;
select cron.schedule('broadcasts-due', '*/5 * * * *', $$select public.run_due_broadcasts()$$);;
