-- The full SMS set for the member and guest lifecycle.
--
-- The discipline, because SMS is the one channel that interrupts: a message
-- earns a text only when it is TIME-CRITICAL, ACTION-REQUIRED, and email would
-- lose the race. Everything else stays on email, push and the Word. The club
-- already sends eleven emails; none of these duplicate one, they overtake it.
--
-- The sharpest case is new: boarding is now gated on a signed waiver, so an
-- unsigned member or guest cannot board at all. A text the evening before is the
-- difference between signing on a phone and being turned away at the dock.
--
-- draft_body carries the wording the club intends. provider_template_id stays
-- null until that wording is registered and APPROVED with sent.dm — an
-- unregistered code is skipped, never failed.

alter table public.sms_templates
  add column if not exists draft_body text,
  add column if not exists tier integer not null default 3,
  add column if not exists audience text not null default 'member'
    check (audience in ('member', 'guest', 'crew'));

comment on column public.sms_templates.draft_body is
  'The wording the club intends, with {{name}} placeholders. sent.dm holds the approved version; this is the source it was cut from.';
comment on column public.sms_templates.tier is
  '1 = prevents a failure at the dock. 2 = a time-critical opportunity. 3 = day-of orientation. 4 = account.';

update public.sms_templates set
  tier = 1, audience = 'member',
  draft_body = 'LYRE SOCIAL: {{sailing}} is held for weather. {{next_step}} Your pass carries and nothing further is charged until we sail.',
  parameter_map = '{"sailing":"title","next_step":"body"}'::jsonb
where code = 'weather-hold';

update public.sms_templates set
  tier = 1, audience = 'member',
  draft_body = 'LYRE SOCIAL: Muster has moved for {{sailing}}. {{instruction}} Come to the new point; the gangway has your name.',
  parameter_map = '{"sailing":"title","instruction":"body"}'::jsonb
where code = 'muster';

insert into public.sms_templates (code, tier, audience, channels, parameter_map, draft_body, note) values

  -- Tier 1 — a failure at the dock, prevented.
  ('waiver-outstanding', 1, 'member', '{sms}',
   '{"sailing":"title","link":"link"}'::jsonb,
   'LYRE SOCIAL: You sail on {{sailing}} and your waiver is still outstanding. Nobody boards unsigned. Sign here and it takes a minute: {{link}}',
   'Sent the evening before when a confirmed member has no current waiver. Boarding is gated on it.'),

  ('guest-waiver-request', 1, 'guest', '{sms}',
   '{"member":"member","sailing":"title","link":"link"}'::jsonb,
   'LYRE SOCIAL: {{member}} has brought you aboard {{sailing}}. Read and sign before you come to the dock, it takes a minute: {{link}}',
   'The guest has no account and may never see an email. This is the channel that reaches them.'),

  ('guest-waiver-reminder', 1, 'guest', '{sms}',
   '{"sailing":"title","link":"link"}'::jsonb,
   'LYRE SOCIAL: A reminder that {{sailing}} needs your signature before you board. Nobody sails unsigned. Sign here: {{link}}',
   'Sent when a guest is still unsigned two days out.'),

  ('voyage-cancelled', 1, 'member', '{sms}',
   '{"sailing":"title","next_step":"body"}'::jsonb,
   'LYRE SOCIAL: {{sailing}} is cancelled. {{next_step}} Nothing is charged and your pass is released.',
   'More urgent than a hold: people are already travelling to the dock.'),

  -- Tier 2 — a time-critical opportunity, missed if it waits for email.
  ('waitlist-release', 2, 'member', '{sms}',
   '{"sailing":"title","hours":"hours","link":"link"}'::jsonb,
   'LYRE SOCIAL: A pass has opened on {{sailing}} and it is yours for {{hours}} hours. Claim it here: {{link}}',
   'Passes are scarce and the window is short. Email loses this race.'),

  ('pass-transfer-offered', 2, 'member', '{sms}',
   '{"member":"member","sailing":"title","link":"link"}'::jsonb,
   'LYRE SOCIAL: {{member}} has offered you their pass for {{sailing}}. Accept or decline here: {{link}}',
   'Somebody is waiting on the answer, and the sailing is fixed.'),

  ('departure-last-call', 2, 'member', '{sms}',
   '{"sailing":"title","muster":"muster"}'::jsonb,
   'LYRE SOCIAL: {{sailing}} slips in thirty minutes. Muster is {{muster}} and the skipper will not hold the boat.',
   'Half an hour out. The one message where lateness is the whole point.'),

  -- Tier 3 — day-of orientation, for people already on their way.
  ('boarding-details', 3, 'member', '{sms}',
   '{"sailing":"title","muster":"muster","vessel":"vessel","code":"code"}'::jsonb,
   'LYRE SOCIAL: {{sailing}} today. Muster {{muster}}, aboard {{vessel}}, your code is {{code}}. Bring soft soles and something warm.',
   'Morning of. Replaces the paper stub for anyone who did not print one.'),

  ('guest-boarding-details', 3, 'guest', '{sms}',
   '{"sailing":"title","muster":"muster","member":"member"}'::jsonb,
   'LYRE SOCIAL: {{sailing}} today with {{member}}. Muster {{muster}}. Bring soft soles and something warm, the rest is aboard.',
   'A guest has no app and no manifest. This is their entire briefing.'),

  ('crew-call-time', 3, 'crew', '{sms}',
   '{"sailing":"title","call_time":"call_time","muster":"muster"}'::jsonb,
   'LYRE SOCIAL: {{sailing}} today. Crew call {{call_time}} at {{muster}}. Certification on you, as always.',
   'Crew are engaged per sailing and are often not in the member app.'),

  -- Tier 4 — the account itself.
  ('verify-code', 4, 'member', '{sms}',
   '{"code":"code"}'::jsonb,
   'LYRE SOCIAL: Your verification code is {{code}}. It is good for ten minutes and we will never ask you for it.',
   'AUTHENTICATION category. sent.dm ships an approved stock template that may serve.'),

  ('dues-final-notice', 4, 'member', '{sms}',
   '{"days":"days","link":"link"}'::jsonb,
   'LYRE SOCIAL: Your dues have not settled and membership pauses in {{days}} days. Put it right here: {{link}}',
   'The FINAL notice only. Earlier attempts stay on email — a text about money reads as a dunning letter.')

on conflict (code) do nothing;
