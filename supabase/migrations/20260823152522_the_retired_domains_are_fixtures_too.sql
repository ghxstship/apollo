-- The fixture guard caught e2e-* and @demo.syrius.social and stopped there.
-- Every one of the seventy messages I requeued as "real" turned out to be
-- addressed to a pre-rebrand fixture domain — @demo.lyre.social, @lyre.social —
-- or to skipper@syrius.social, a seeded account. None was ever deliverable.
--
-- The same one-door-at-a-time mistake as everything else this pass: the rule was
-- written for the addresses in front of me instead of for the shape of the thing.
-- (The widened function body ships in no_real_mail_to_a_fixture; this stands the
-- stranded rows down.)
update public.email_outbox
set status = 'skipped',
    last_error = coalesce(last_error, '') || ' | stood down: not a deliverable address'
where status in ('pending', 'failed', 'sending')
  and (to_email like 'e2e-%' or to_email like 'skipper@%'
       or to_email like '%@demo.%' or to_email like '%@lyre.social'
       or to_email like '%.lyre.social' or to_email like '%@example.%'
       or to_email like '%.invalid' or to_email like '%.test');
