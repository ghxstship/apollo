-- Six drafts ended on {{link}}, and sent.dm requires a letter after the last
-- variable — a rule their docs do not state and the live endpoint does. Caught
-- by running the registration script against the real API: the six trailing-
-- variable drafts failed with the named rule while the rest hit only the
-- onboarding gate.
--
-- Reworded so the link sits mid-sentence. Same voice, still one 160-char
-- segment, still plain GSM-7.

update public.sms_templates t set draft_body = v.body
from (values
  ('waiver-outstanding',
   'LYRE SOCIAL: You sail on {{sailing}} and your waiver is still outstanding. Nobody boards unsigned. Sign at {{link}} and it takes a minute.'),
  ('guest-waiver-request',
   'LYRE SOCIAL: {{member}} has brought you aboard {{sailing}}. Sign at {{link}} before you come to the dock. It takes a minute.'),
  ('guest-waiver-reminder',
   'LYRE SOCIAL: {{sailing}} still needs your signature before you board. Sign at {{link}} and you are done in a minute.'),
  ('waitlist-release',
   'LYRE SOCIAL: A pass has opened on {{sailing}} and it is yours for {{hours}} hours. Claim it at {{link}} before the window closes.'),
  ('pass-transfer-offered',
   'LYRE SOCIAL: {{member}} has offered you their pass for {{sailing}}. Accept or decline at {{link}} while they wait.'),
  ('dues-final-notice',
   'LYRE SOCIAL: Your dues have not settled and membership pauses in {{days}} days. Put it right at {{link}} today.')
) as v(code, body)
where t.code = v.code;
