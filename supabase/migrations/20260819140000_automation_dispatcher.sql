-- The automation dispatcher. Rules have been saveable since the parity work and
-- have never once fired — the Bridge wrote them into a table nothing read.
--
-- One function evaluates every rule for an event; four thin triggers call it.
-- The existing lifecycle triggers are left alone rather than edited, so the
-- dispatcher can be removed as cleanly as it was added.
--
-- Conditions are matched as data, never evaluated as code: a rule's `conditions`
-- object must be contained by the event's context. {} matches everything. That
-- is the same containment operator the clause library uses for conditional
-- assembly, and it means a rule can never do more than select.

create or replace function public.run_automations(
  p_event      text,
  p_profile_id uuid default null,
  p_voyage_id  uuid default null
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  ctx      jsonb;
  r        record;
  fired    integer := 0;
  v_title  text;
  v_body   text;
  v_member text;
  v_voyage text;
  v_email  text;
begin
  -- The context an event carries: who it happened to, and where.
  select p.full_name, p.email into v_member, v_email
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
    end if;

    update public.automations set last_run_at = now() where id = r.id;
  end loop;

  return fired;
end;
$$;

revoke execute on function public.run_automations(text, uuid, uuid) from public, anon, authenticated;

-- ===== The four events the Bridge offers =====================================

create or replace function public.automations_on_rsvp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aboard' and coalesce(old.status::text, '') is distinct from 'aboard' then
    perform public.run_automations('pass_confirmed', new.profile_id, new.voyage_id);
  end if;
  return null;
end;
$$;

drop trigger if exists automations_pass_confirmed on public.rsvps;
create trigger automations_pass_confirmed
after insert or update of status on public.rsvps
for each row execute function public.automations_on_rsvp();

/* Voyage events fan out to everybody aboard — a weather hold is news for the
   manifest, not for one person. */
create or replace function public.automations_on_voyage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev text;
  m  uuid;
begin
  if new.status is not distinct from old.status then return null; end if;
  ev := case new.status
          when 'weather_hold' then 'weather_hold'
          when 'completed'    then 'voyage_completed'
          else null end;
  if ev is null then return null; end if;

  for m in
    select distinct profile_id from public.rsvps
    where voyage_id = new.id and status = 'aboard'
  loop
    perform public.run_automations(ev, m, new.id);
  end loop;
  return null;
end;
$$;

drop trigger if exists automations_voyage_status on public.voyages;
create trigger automations_voyage_status
after update of status on public.voyages
for each row execute function public.automations_on_voyage();

create or replace function public.automations_on_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.run_automations('member_joined', new.id, null);
  return null;
end;
$$;

drop trigger if exists automations_member_joined on public.profiles;
create trigger automations_member_joined
after insert on public.profiles
for each row execute function public.automations_on_profile();

create or replace function public.automations_on_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'past_due' and coalesce(old.status::text, '') is distinct from 'past_due' then
    perform public.run_automations('dues_failed', new.profile_id, null);
  end if;
  return null;
end;
$$;

drop trigger if exists automations_dues_failed on public.subscriptions;
create trigger automations_dues_failed
after insert or update of status on public.subscriptions
for each row execute function public.automations_on_subscription();

revoke execute on function public.automations_on_rsvp() from public, anon, authenticated;
revoke execute on function public.automations_on_voyage() from public, anon, authenticated;
revoke execute on function public.automations_on_profile() from public, anon, authenticated;
revoke execute on function public.automations_on_subscription() from public, anon, authenticated;
