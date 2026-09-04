-- The carrier refuses a draft that ends on a variable (20260819201000 wrote
-- the rule down), and "[un]: {{title}} — {{body}}" did. A word after the last
-- variable, and a plain hyphen so the text stays in the seven-bit alphabet
-- rather than doubling its segments on an em dash.
update public.sms_templates
   set draft_body = '[un] {{title}}: {{body}} - the Bridge.',
       variable_samples = '{"title":"Saturday has moved","body":"Same hour, new door: the boathouse on 5th."}'::jsonb
 where code = 'bridge-word';;
