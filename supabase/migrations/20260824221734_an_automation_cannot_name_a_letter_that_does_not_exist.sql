-- The SMS branch of run_automations checks that the template it names is
-- actually registered. The EMAIL branch checks nothing at all: it takes
-- `action->>'template'` verbatim, and a typo falls through render()'s default
-- to "A word from Shoreside." — a real letter, correctly addressed, with no
-- content, sent to a member because somebody mistyped a word in a form.
--
-- The sender's template list lives in TypeScript, so SQL had nothing to check
-- against. It does now. The registry is the club's statement of which letters
-- exist; the audit already refuses a template that reads a payload key nothing
-- writes, and this refuses a caller that names a letter nothing renders.
create table if not exists public.email_templates (
  code        text primary key,
  description text not null,
  active      boolean not null default true
);

alter table public.email_templates enable row level security;

drop policy if exists "anyone signed in reads the letter registry" on public.email_templates;
create policy "anyone signed in reads the letter registry"
  on public.email_templates for select to authenticated using (true);

insert into public.email_templates (code, description) values
  ('application-received', 'Lodged. A person reads it next.'),
  ('port-invite',         'Come ashore once, as our guest.'),
  ('salon-invite',        'An invitation to a Table.'),
  ('welcome-aboard',      'Aboard — the papers and the first steps.'),
  ('boarding-pass',       'Your pass is held: code, muster, departure.'),
  ('waitlist-release',    'A pass released to you, with the code.'),
  ('weather-hold',        'Held for weather.'),
  ('voyage-cancelled',    'Called off, and credited in full.'),
  ('season-card',         'Your season, on the record.'),
  ('refund-posted',       'A refund is on your account.'),
  ('farewell',            'Fair winds.'),
  ('lore-digest',         'Episodes, Sundays.'),
  ('dispatch-digest',     'Episodes, Sundays (legacy key, still queued rows).'),
  ('episode-digest',      'Episodes, Sundays (legacy key, still queued rows).')
on conflict (code) do nothing;

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

    v_title := replace(replace(coalesce(r.action->>'title', ''), '{member}', coalesce(v_member, 'A member')), '{voyage}', coalesce(v_voyage, 'the sailing'));
    v_body  := replace(replace(coalesce(r.action->>'body', ''),  '{member}', coalesce(v_member, 'A member')), '{voyage}', coalesce(v_voyage, 'the sailing'));

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
          jsonb_strip_nulls(jsonb_build_object('name', v_member, 'voyage', v_voyage))
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
        -- The payload used to be {name, voyage}, while every registered
        -- parameter_map keys on title/body/link/code/muster — and the sender
        -- silently omits a parameter it cannot find. An SMS automation would
        -- have reached the carrier with an EMPTY parameter set and the member
        -- would have read "{{sailing}}" and "{{next_step}}" unfilled. The keys
        -- the maps actually ask for are supplied here.
        insert into public.sms_outbox (to_phone, template, payload)
        values (
          btrim(v_phone),
          v_code,
          jsonb_strip_nulls(jsonb_build_object(
            'name',    v_member,
            'voyage',  v_voyage,
            'sailing', v_voyage,
            'title',   nullif(btrim(v_title), ''),
            'body',    nullif(btrim(v_body), ''),
            'link',    'https://syrius.social/manifest'
          ))
        );
        fired := fired + 1;
      end if;
    end if;

    update public.automations set last_run_at = now() where id = r.id;
  end loop;

  return fired;
end;
$function$;
;
