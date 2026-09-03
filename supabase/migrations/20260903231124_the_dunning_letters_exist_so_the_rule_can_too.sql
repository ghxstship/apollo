-- The dues_failed automation has been firing since August with nowhere to go.
-- A subscriptions trigger calls run_automations('dues_failed', ...) and the
-- Bridge exposes the rule — but the letter catalogue held nothing for a failed
-- payment, and a migration enforces that an automation cannot name a letter
-- that does not exist. So the rule could not be created, and involuntary churn
-- went unworked: usually a fifth to two fifths of all churn, and the cheapest
-- revenue any club recovers, because the member never chose to leave.
--
-- Three letters, because dunning is a sequence and a single email is not one.
insert into public.email_templates (code, description, active) values
  ('dues-failed',   'The card was declined. Nothing changes today; we retry.', true),
  ('card-expiring', 'The card on file expires soon — replace it before it skips.', true),
  ('final-notice',  'Last word before a standing pauses, with the date it happens.', true)
on conflict (code) do nothing;;
