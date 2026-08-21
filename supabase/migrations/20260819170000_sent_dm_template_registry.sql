-- SMS moves from Twilio to sent.dm, and the two providers differ in a way that
-- reaches the schema rather than just the edge function.
--
-- Twilio takes a body string: the function rendered the words and sent them.
-- sent.dm v3 takes a TEMPLATE ID plus parameters — there is no ad-hoc text, and
-- a template must be approved (by Meta where a WhatsApp Business Account is
-- connected, otherwise by sent.dm's compliance team, per channel) before
-- anything sends against it.
--
-- So the club's local template codes have to map to sent.dm's template ids, and
-- that mapping is a fact with a home of its own rather than a constant compiled
-- into a function. Changing a template id then costs an UPDATE, not a redeploy.
--
-- sent.dm is also multi-channel — SMS, WhatsApp and RCS off one template — so
-- the channel list travels with the mapping.

create table if not exists public.sms_templates (
  code                 text primary key,
  provider_template_id uuid,
  channels             text[] not null default '{sms}',
  -- Which payload keys become which template variables. sent.dm names its
  -- variables; the outbox speaks in title/body.
  parameter_map        jsonb not null default '{}'::jsonb,
  active               boolean not null default true,
  note                 text,
  created_at           timestamptz not null default now()
);

comment on table public.sms_templates is
  'Local template code -> sent.dm template id. Null id means the template is not registered yet, and the outbox row is skipped rather than failed.';

comment on column public.sms_templates.provider_template_id is
  'From sent.dm. A template must be APPROVED there before a send against it is accepted.';

alter table public.sms_templates enable row level security;

create policy "staff keep sms templates" on public.sms_templates
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

revoke insert, update, delete on public.sms_templates from anon;

-- The two the club actually sends. Day-of only: a weather hold and a moved
-- muster are the messages where email loses the race.
insert into public.sms_templates (code, channels, parameter_map, note) values
  ('weather-hold', '{sms}',
   '{"var_1":"title","var_2":"body"}'::jsonb,
   'Sailing held for weather. Wants: the sailing, and what happens next.'),
  ('muster', '{sms}',
   '{"var_1":"body"}'::jsonb,
   'Muster point moved. Wants: the new instruction.')
on conflict (code) do nothing;
