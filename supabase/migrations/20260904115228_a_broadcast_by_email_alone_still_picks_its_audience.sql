-- The audience predicate in send_broadcast was written as
--   p.email is not null or 'notice' = any(p_channels) and case ... end
-- and AND binds before OR. With email as the only channel that reads as
-- "anyone with an address, or (false and the audience)" — every member with
-- an email, whatever audience was chosen. Caught on review before any send.
-- The parentheses are the fix; the rest is the same function.

create or replace function public.send_broadcast(
  p_audience jsonb,
  p_title text,
  p_body text,
  p_channels text[]
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
  v_by   uuid := auth.uid();
  v_n    integer := 0;
  r record;
begin
  if not public.is_staff() then raise exception 'the bridge speaks; members do not'; end if;
  if v_kind not in ('all','city','tier','episode','lapsed') then raise exception 'no such audience'; end if;
  if length(coalesce(p_title, '')) between 1 and 120 is not true then raise exception 'a title is one line'; end if;
  if length(coalesce(p_body, '')) between 1 and 2000 is not true then raise exception 'the word is up to two thousand characters'; end if;
  if not (p_channels && array['notice','email']) then raise exception 'pick a channel'; end if;
  if v_kind in ('city','episode') and v_id is null then raise exception 'that audience needs an id'; end if;
  if v_kind = 'tier' and v_tier not in ('regional','national','global') then raise exception 'no such tier'; end if;

  for r in
    select p.id, p.email, p.full_name
      from public.profiles p
     where (p.email is not null or 'notice' = any(p_channels))
       and case v_kind
             when 'all'     then p.status = 'active'
             when 'city'    then p.status = 'active' and p.home_city = v_id
             when 'tier'    then p.status = 'active' and p.tier::text = v_tier
             when 'lapsed'  then p.status = 'paused' and p.hold_reason = 'dues'
             when 'episode' then exists (select 1 from public.passes x
                                          where x.profile_id = p.id and x.episode_id = v_id and x.status = 'aboard')
           end
  loop
    if 'notice' = any(p_channels) then
      insert into public.notifications (profile_id, kind, title, body, episode_id)
      values (r.id, 'word', p_title, p_body, case when v_kind = 'episode' then v_id end);
    end if;
    if 'email' = any(p_channels) and r.email is not null then
      insert into public.email_outbox (to_email, template, payload)
      values (r.email, 'bridge-word', jsonb_build_object('name', r.full_name, 'title', p_title, 'body', p_body));
    end if;
    v_n := v_n + 1;
  end loop;

  insert into public.broadcasts (sent_by, audience, title, body, channels, recipients)
  values (v_by, p_audience, p_title, p_body, p_channels, v_n);
  return v_n;
end $function$;;
