-- The dispatcher fired one action per event with no delay and no memory.
-- "Three days after a night wraps, send X" and "when a member joins, tell
-- the CRM" are the two shapes the leaders have and this club did not. A rule
-- with a delay lands in a queue the five-minute clock drains; a rule may
-- also call a registered webhook. Surgery on the live body, anchored.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'run_automations' and p.pronamespace = 'public'::regnamespace;

  if src not like '%public.run_automations(p_event text, p_profile_id uuid DEFAULT NULL::uuid, p_episode_id uuid DEFAULT NULL::uuid)%' then
    raise exception 'run_automations: signature anchor missing';
  end if;
  src := replace(src, 'public.run_automations(p_event text, p_profile_id uuid DEFAULT NULL::uuid, p_episode_id uuid DEFAULT NULL::uuid)',
                      'public.run_automations(p_event text, p_profile_id uuid DEFAULT NULL::uuid, p_episode_id uuid DEFAULT NULL::uuid, p_only uuid DEFAULT NULL::uuid, p_immediate boolean DEFAULT false)');

  if src not like '%    where active and trigger_event = p_event
    order by created_at
  loop
    -- Containment, not evaluation. A rule selects; it cannot compute.
    continue when not (ctx @> coalesce(r.conditions, ''{}''::jsonb));
%' then raise exception 'run_automations: loop anchor missing'; end if;
  src := replace(src, '    where active and trigger_event = p_event
    order by created_at
  loop
    -- Containment, not evaluation. A rule selects; it cannot compute.
    continue when not (ctx @> coalesce(r.conditions, ''{}''::jsonb));
',
'    where active and trigger_event = p_event
      and (p_only is null or id = p_only)
    order by created_at
  loop
    -- Containment, not evaluation. A rule selects; it cannot compute.
    continue when not (ctx @> coalesce(r.conditions, ''{}''::jsonb));

    -- A rule with a delay waits its turn in the queue; the clock brings it
    -- back through here with p_immediate set.
    if coalesce(r.delay_minutes, 0) > 0 and not p_immediate then
      insert into public.automation_queue (automation_id, profile_id, episode_id, payload, run_at)
      values (r.id, p_profile_id, p_episode_id, ctx, now() + make_interval(mins => r.delay_minutes));
      continue;
    end if;

    if r.action->>''kind'' = ''webhook'' then
      insert into public.webhook_deliveries (webhook_id, event, payload)
      select w.id, ''automation.'' || p_event,
             jsonb_build_object(''automation'', r.name, ''event'', p_event, ''profile_id'', p_profile_id, ''episode_id'', p_episode_id, ''context'', ctx)
        from public.webhooks w
       where w.active and w.id = nullif(r.action->>''webhook_id'', '''')::uuid;
      fired := fired + 1;
      update public.automations set last_run_at = now() where id = r.id;
      continue;
    end if;
');
  execute src;
end $$;

drop function if exists public.run_automations(text, uuid, uuid);

create or replace function public.run_automation_queue()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare q record; n integer := 0;
begin
  for q in
    select qq.id, qq.automation_id, qq.profile_id, qq.episode_id, a.trigger_event
      from public.automation_queue qq join public.automations a on a.id = qq.automation_id
     where qq.done_at is null and qq.run_at <= now() and a.active
     order by qq.run_at
     limit 200
  loop
    perform public.run_automations(q.trigger_event, q.profile_id, q.episode_id, q.automation_id, true);
    update public.automation_queue set done_at = now() where id = q.id;
    n := n + 1;
  end loop;
  /* A rule switched off while its rows waited: the rows are marked done
     rather than firing later as a surprise. */
  update public.automation_queue qq set done_at = now()
    from public.automations a where a.id = qq.automation_id and qq.done_at is null and not a.active;
  return n;
end $function$;
revoke all on function public.run_automation_queue() from public, anon, authenticated;
select cron.schedule('automation-queue', '*/5 * * * *', $$select public.run_automation_queue()$$);;
