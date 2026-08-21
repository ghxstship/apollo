-- sent.dm requires a sample value for every template variable at creation time
-- (reviewers read the sample, not the placeholder). A sample is a fact about the
-- template, so it lives with the template — not hardcoded in whatever script
-- happens to do the registering.
--
-- Keys match parameter_map's keys, which are the variable names the send passes.

alter table public.sms_templates
  add column if not exists variable_samples jsonb not null default '{}'::jsonb;

comment on column public.sms_templates.variable_samples is
  'Sample value per variable name, required by sent.dm at template creation. Reviewers see the sample.';

update public.sms_templates t set variable_samples = v.samples::jsonb
from (values
  ('weather-hold',          '{"sailing":"The long way home","next_step":"We call it again by 18:00 tomorrow."}'),
  ('muster',                '{"sailing":"The long way home","instruction":"Now Gangway C, Dinner Key Marina."}'),
  ('waiver-outstanding',    '{"sailing":"The long way home","link":"https://lyre.social/agreements/member-waiver"}'),
  ('guest-waiver-request',  '{"member":"Mara Vasquez","sailing":"The long way home","link":"https://lyre.social/sign/a1b2c3"}'),
  ('guest-waiver-reminder', '{"sailing":"The long way home","link":"https://lyre.social/sign/a1b2c3"}'),
  ('voyage-cancelled',      '{"sailing":"The long way home","next_step":"Your pass is released in full."}'),
  ('waitlist-release',      '{"sailing":"The long way home","hours":"6","link":"https://lyre.social/manifest"}'),
  ('pass-transfer-offered', '{"member":"Mara Vasquez","sailing":"The long way home","link":"https://lyre.social/manifest"}'),
  ('departure-last-call',   '{"sailing":"The long way home","muster":"Dock C, Dinner Key Marina"}'),
  ('boarding-details',      '{"sailing":"The long way home","muster":"Dock C, Dinner Key Marina","vessel":"Calliope","code":"LS-1042"}'),
  ('guest-boarding-details','{"sailing":"The long way home","muster":"Dock C, Dinner Key Marina","member":"Mara Vasquez"}'),
  ('crew-call-time',        '{"sailing":"The long way home","call_time":"07:30","muster":"Dock C, Dinner Key Marina"}'),
  ('verify-code',           '{"code":"123456"}'),
  ('dues-final-notice',     '{"days":"7","link":"https://lyre.social/account"}')
) as v(code, samples)
where t.code = v.code;
