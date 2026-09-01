-- The [UN] rebrand rewrote every column in the SMS registry except the one the
-- carrier actually reads. Every draft_body opens "[un]:", every link points at
-- unhingedsocial.us, the sample boarding code is UN-1042 — and the template is
-- still NAMED syrius_weather_hold. provider_template_name was missed because it
-- is generated rather than written by hand, and because no rendered surface
-- shows it: the route audit reads pages and the e2e suite reads pages, and
-- neither has ever read this registry. It is the same blind spot the last
-- rebrand's migration (20260824002608) called out in its own opening line.
--
-- These names are the club's convention, not a foreign key. 20260819190000
-- minted them as 'lyre_' || replace(code,'-','_') and the last rebrand rewrote
-- the prefix once already, so this is the third turn of a wheel that is
-- supposed to turn.
--
-- Renaming is safe rather than an outage on the day-of path, and the reason is
-- worth stating because the opposite would be expensive: nothing is registered
-- under the old names. register-sms-templates records provider_template_id
-- whenever it creates OR finds a template at sent.dm, and all fourteen rows are
-- still null — creation is gated on a WhatsApp Business account that is not
-- connected, so every create returns VALIDATION_001. Nothing resolves today,
-- so nothing can stop resolving. When the account is onboarded, the names the
-- club submits will be the ones its messages already speak.
--
-- Anchored at ^ so this can only ever touch a retired prefix, and both retired
-- brands are covered because a row minted before the last rebrand and never
-- swept would still be on lyre_.
update public.sms_templates
   set provider_template_name = regexp_replace(provider_template_name, '^(syrius|lyre)_', 'un_')
 where provider_template_name ~ '^(syrius|lyre)_';

-- The registry is the one surface no gate crawls, so the check rides with the
-- change rather than trusting a later pass to notice.
do $$
declare stale int;
begin
  select count(*) into stale
    from public.sms_templates
   where provider_template_name ~* '(syrius|lyre)'
      or draft_body ~* '(syrius|lyre)'
      or coalesce(note,'') ~* '(syrius|lyre)'
      or coalesce(variable_samples::text,'') ~* '(syrius|lyre)';
  if stale > 0 then
    raise exception 'the retired brand still stands in % sms_templates row(s)', stale;
  end if;
end $$;
