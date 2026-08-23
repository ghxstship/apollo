-- The dispatcher could put a word in the Word and queue an email, but not send
-- a text — even though the SMS queue and fourteen registered templates were
-- already in place. Push needed nothing: a notification already fans out to
-- push by trigger, so the 'notify' kind reaches the phone that way.
--
-- A text is different from an email: sent.dm is template-only, so a rule names
-- a registered template code and the dispatcher refuses anything else rather
-- than queueing a message that will bounce at the provider. A member with no
-- number on file is skipped, not failed.
create or replace function public.run_automations(
  p_event text,
  p_profile_id uuid default null::uuid,
  p_voyage_id uuid default null::uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ctx      jsonb;
  r        record;
  fired    integer := 0;
  v_title  text;
  v_body   text;
  v_member text;
  v_voyage text;
  v_email  text;
  v_phone  text;
  v_code   text;
begin
  -- The context an event carries: who it happened to, and where.
  select p.full_name, p.email, p.phone into v_member, v_email, v_phone
  from public.profiles p where p.id = p_profile_id;

  select v.title into v_voyage from public.voyages v where v.id = p_voyage_id;

  select jsonb_strip_nulls(jsonb_build_object(
    'tier',   (select tier::text from public.profiles where id = p_profile_id),
    'harbor', (select h.slug from public.voyages v
               join public.harbors h on h.id = v.harbor_id where v.id = p_voyage_id),
    'class',  (select class::text from public.voyages where id = p_voyage_id)
  )) into ctx;

  for r in
    select * from public.automations
    where active and trigger_event = p_event
    order by created_at
  loop
    -- Containment, not evaluation. A rule selects; it cannot compute.
    continue when not (ctx @> coalesce(r.conditions, '{}'::jsonb));

    if r.action->>'kind' = 'notify' and p_profile_id is not null then
      v_title := replace(replace(coalesce(r.action->>'title', ''), '{member}', coalesce(v_member, 'A member')), '{voyage}', coalesce(v_voyage, 'the sailing'));
      v_body  := replace(replace(coalesce(r.action->>'body', ''),  '{member}', coalesce(v_member, 'A member')), '{voyage}', coalesce(v_voyage, 'the sailing'));
      if btrim(v_title) <> '' then
        insert into public.notifications (profile_id, kind, title, body)
        values (p_profile_id, 'word', v_title, nullif(btrim(v_body), ''));
        fired := fired + 1;
      end if;

    elsif r.action->>'kind' = 'email' and v_email is not null then
      insert into public.email_outbox (to_email, template, payload)
      values (
        v_email,
        r.action->>'template',
        jsonb_build_object('name', v_member, 'voyage', v_voyage)
      );
      fired := fired + 1;

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
        insert into public.sms_outbox (to_phone, template, payload)
        values (
          btrim(v_phone),
          v_code,
          jsonb_strip_nulls(jsonb_build_object('name', v_member, 'voyage', v_voyage))
        );
        fired := fired + 1;
      end if;
    end if;

    update public.automations set last_run_at = now() where id = r.id;
  end loop;

  return fired;
end;
$function$;
