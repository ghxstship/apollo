-- Six registered SMS templates still carry https://lyre.social/... — in
-- variable_samples and in draft_body: guest-waiver-request,
-- guest-waiver-reminder, waiver-outstanding, waitlist-release,
-- pass-transfer-offered, dues-final-notice. "lyre.social" is in BANNED_TERMS,
-- and the samples are not decoration: they are the examples submitted to the
-- carrier when a template is registered for approval, so the retired brand was
-- going out under the club's name to a third party.
--
-- It survived because neither gate looks here. The route audit reads rendered
-- pages and the e2e suite reads rendered pages; nothing reads the registry.
update public.sms_templates
   set variable_samples = replace(variable_samples::text, 'lyre.social', 'syrius.social')::jsonb
 where variable_samples::text like '%lyre.social%';

update public.sms_templates
   set draft_body = replace(draft_body, 'lyre.social', 'syrius.social')
 where draft_body like '%lyre.social%';

update public.sms_templates
   set note = replace(note, 'lyre.social', 'syrius.social')
 where note like '%lyre.social%';;
