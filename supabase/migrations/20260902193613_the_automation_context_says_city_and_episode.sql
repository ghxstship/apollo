/* run_automations still spoke the old language inside its own body, which the
   parameter rename did not reach: it built the match context under a 'harbor'
   key, filled message placeholders named {voyage}, and pointed every SMS at
   /manifest — a route that has answered with a 308 since the surfaces were
   aligned.

   The placeholder change accepts BOTH tokens on purpose. Automation rows
   already written by an operator carry {voyage} in their title and body, and a
   rename that silently stopped substituting would ship literal curly braces to
   a member's phone. {episode} is the word now; {voyage} keeps working.

   The SMS payload likewise KEEPS its existing keys and adds the new one.
   sms_templates.parameter_map is authored per template and keys on 'sailing'
   and 'voyage'; dropping those would empty the parameter set and send
   "{{sailing}}" unfilled, which is the exact failure this function's own
   comment records having already shipped once. */
create or replace function public.run_automations(p_event text, p_profile_id uuid default null::uuid, p_episode_id uuid default null::uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ctx       jsonb;
  r         record;
  fired     integer := 0;
  v_title   text;
  v_body    text;
  v_member  text;
  v_episode text;
  v_email   text;
  v_phone   text;
  v_code    text;
begin
  -- The context an event carries: who it happened to, and where.
  select p.full_name, p.email, case when p.phone_verified then p.phone end into v_member, v_email, v_phone
  from public.profiles p where p.id = p_profile_id;

  select v.title into v_episode from public.episodes v where v.id = p_episode_id;

  select jsonb_strip_nulls(jsonb_build_object(
    'tier',    (select tier::text from public.profiles where id = p_profile_id),
    'city',    (select h.slug from public.episodes v
                 join public.cities h on h.id = v.city_id where v.id = p_episode_id),
    'setting', (select setting::text from public.episodes where id = p_episode_id)
  )) into ctx;

  for r in
    select * from public.automations
    where active and trigger_event = p_event
    order by created_at
  loop
    -- Containment, not evaluation. A rule selects; it cannot compute.
    continue when not (ctx @> coalesce(r.conditions, '{}'::jsonb));

    v_title := coalesce(r.action->>'title', '');
    v_body  := coalesce(r.action->>'body', '');
    v_title := replace(replace(replace(v_title, '{member}', coalesce(v_member, 'A member')), '{episode}', coalesce(v_episode, 'the episode')), '{voyage}', coalesce(v_episode, 'the episode'));
    v_body  := replace(replace(replace(v_body,  '{member}', coalesce(v_member, 'A member')), '{episode}', coalesce(v_episode, 'the episode')), '{voyage}', coalesce(v_episode, 'the episode'));

    if r.action->>'kind' = 'notify' and p_profile_id is not null then
      if btrim(v_title) <> '' then
        insert into public.notifications (profile_id, kind, title, body)
        values (p_profile_id, 'word', v_title, nullif(btrim(v_body), ''));
        fired := fired + 1;
      end if;

    elsif r.action->>'kind' = 'email' and v_email is not null then
      v_code := btrim(coalesce(r.action->>'template', ''));
      -- Only a letter the sender can actually render.
      if not exists (
        select 1 from public.email_templates t where t.code = v_code and t.active
      ) then
        raise warning 'automation % names a letter that does not exist: %', r.id, v_code;
      else
        insert into public.email_outbox (to_email, template, payload)
        values (
          v_email,
          v_code,
          jsonb_strip_nulls(jsonb_build_object('name', v_member, 'episode', v_episode, 'voyage', v_episode))
        );
        fired := fired + 1;
      end if;

    elsif r.action->>'kind' = 'sms' then
      v_code := btrim(coalesce(r.action->>'template', ''));
      -- Template-only, and only one we have actually registered.
      if not exists (
        select 1 from public.sms_templates t where t.code = v_code and t.active
      ) then
        raise warning 'automation % names an unregistered text template: %', r.id, v_code;
      elsif coalesce(btrim(v_phone), '') = '' then
        -- No number on file is a skip, not a failure.
        null;
      else
        /* The payload used to be {name, voyage}, while every registered
           parameter_map keys on title/body/link/code/muster — and the sender
           silently omits a parameter it cannot find. An SMS automation would
           have reached the carrier with an EMPTY parameter set and the member
           would have read the placeholders unfilled. The keys the maps ask for
           are supplied here, and the old ones are kept beside the new. */
        insert into public.sms_outbox (to_phone, template, payload)
        values (
          btrim(v_phone),
          v_code,
          jsonb_strip_nulls(jsonb_build_object(
            'name',    v_member,
            'episode', v_episode,
            'voyage',  v_episode,
            'sailing', v_episode,
            'title',   nullif(btrim(v_title), ''),
            'body',    nullif(btrim(v_body), ''),
            'link',    'https://unhingedsocial.us/passes'
          ))
        );
        fired := fired + 1;
      end if;
    end if;

    update public.automations set last_run_at = now() where id = r.id;
  end loop;

  return fired;
end;
$function$;;
