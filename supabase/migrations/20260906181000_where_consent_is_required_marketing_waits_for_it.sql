-- Marketing was opt-out by construction, for everybody, on every channel.
--
-- Every reader coalesces a missing preference key to TRUE -- in TypeScript
-- (`typeof v === "boolean" ? v : true`) and in eight SQL readers alike -- and
-- live, not one of the seventeen profiles carries a channels key at all. So the
-- club's position was: everyone is subscribed to everything until they say
-- otherwise.
--
-- In the United States that is lawful and ordinary: CAN-SPAM is an opt-out
-- regime. It is not lawful under GDPR Art. 6(1)(a) or ePrivacy Art. 13 for a
-- recipient in the EEA or the UK, nor under CASL in Canada -- and the club sells
-- a Global standing from launch.
--
-- WHERE THIS IS ENFORCED, and why it is not in the eight readers. Those readers
-- are the transactional fan-out: a released berth, a weather hold, a change to
-- a night somebody holds a pass on. Defaulting THOSE true is correct -- a
-- transactional message is exempt in every one of these regimes, and a member
-- who misses a weather hold because a consent box was unticked has been failed
-- by the club, not protected by it. Patching them would be patching the wrong
-- thing.
--
-- The marketing path is the one that needs a gate, and it needs it in ONE
-- place, because the failure mode is somebody adding a ninth way to queue a
-- letter. That place is the sender: every letter, however queued, passes
-- through send-outbox, which already knows which codes are marketing and
-- already reads a suppression list in bulk before a drain. This function is
-- read the same way, at the same moment, and a letter that must not go is
-- skipped exactly as a suppressed one is.

create or replace function public.marketing_withheld_from(p_emails text[])
returns table (email text, why text)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select lower(p.email),
         'no recorded consent — ' || coalesce(p.jurisdiction, 'jurisdiction not established')
    from public.profiles p
   where p.email is not null
     and lower(p.email) = any (select lower(e) from unnest(p_emails) e)
     /* Only where prior consent is the rule. In the United States the opt-out
        the club already offers is the lawful arrangement, and withholding mail
        from an American member who never objected would be inventing a rule
        nobody has. */
     and public.marketing_needs_opt_in(p.jurisdiction)
     /* Granted means the newest row for a marketing subject says so. Silence is
        not consent, which is the entire point -- and an old grant that was
        later withdrawn is a withdrawal, because current_consent reads the
        newest row and not the first. */
     and not exists (
       select 1 from public.current_consent c
        where c.profile_id = p.id
          and c.subject = 'marketing_email'
          and c.granted
     );
$fn$;

revoke all on function public.marketing_withheld_from(text[]) from public, anon, authenticated;

comment on function public.marketing_withheld_from(text[]) is
  'Of the addresses given, those the club may not send marketing to because their jurisdiction requires prior consent and no consent is recorded. Read in bulk by send-outbox at the same moment it reads suppressions, which is the single chokepoint every letter passes through regardless of how it was queued -- deliberately not enforced in the eight transactional fan-out readers, whose default of true is correct for messages that are exempt everywhere. Service role only.';

-- The words a member is shown when the club asks. Version 1 of
-- marketing_email already exists from the consent ledger; this is the note
-- that says where it is asked, so the next reader does not have to grep.

comment on table public.consent_records is
  'One row per grant or withdrawal, append-only. A withdrawal is a row, not the absence of one -- which is the whole point: the club can show it stopped when it was asked to. The current state of a consent is the newest row for that subject, which is what current_consent reads. The marketing_email subject is the one with teeth: where marketing_needs_opt_in() is true for a member''s jurisdiction, no row means no marketing, enforced at the sender.';

notify pgrst, 'reload schema';
