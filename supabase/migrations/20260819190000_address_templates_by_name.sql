-- sent.dm accepts a template by NAME as well as by id, which is a better hinge
-- for this integration than a UUID.
--
-- With ids, going live means creating fourteen templates in the dashboard and
-- copying fourteen opaque UUIDs back into the database, with a transcription
-- error waiting at every one. With names, the club creates a template called
-- lyre_weather_hold and the send simply finds it. Nothing to copy, nothing to
-- wire, and the name is legible in both systems.
--
-- The id column stays: it is what the provider returns and it pins an exact
-- template if a name is ever reused. Name is tried first, id is the fallback.

alter table public.sms_templates
  add column if not exists provider_template_name text;

comment on column public.sms_templates.provider_template_name is
  'The template name to create in sent.dm. Sends address this first; provider_template_id is the fallback.';

-- The convention: lyre_ plus the code with hyphens turned to underscores.
update public.sms_templates
set provider_template_name = 'lyre_' || replace(code, '-', '_')
where provider_template_name is null;

-- A template is sendable once it has a name or an id. Before either, the outbox
-- row is skipped rather than failed.
comment on table public.sms_templates is
  'Local template code -> sent.dm template. Addressed by name, with id as fallback. Neither present means the code is skipped, not failed.';
