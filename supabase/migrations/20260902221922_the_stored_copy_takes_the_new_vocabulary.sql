/* Copy that lives in rows rather than in code, and reads the same to a member
   or an operator as anything rendered from React.

   1. The one active automation. run_automations substitutes {episode} and
      {voyage} both, on purpose and with a comment saying why: a rule an
      operator wrote before the rename must keep working rather than shipping
      literal curly braces to a phone. That compatibility is for rows nobody
      has revisited — it is not a reason for the rule the club ships to keep
      using the retired token. The name said "on sailings" as well, and the
      Bridge shows that name.

   2. The Full Compass order. Its blurb read 'Sailed out of every open
      harbor.' — a banned term that slips the gate only because the ban
      carries a trailing space and this one is sentence-final. The verb stays
      (you do sail out of a city); the noun goes.

   3. Four email_templates descriptions. The KEYS are plumbing and stay:
      salon-invite, lore-digest, dispatch-digest and episode-digest are all
      aliased in send-outbox with comments explaining that rows queued under
      the old key still have to render. The descriptions are not plumbing —
      the Bridge lists them to an operator choosing a letter — and three of
      them still called the Sunday digest "Episodes", which since the rename
      names an EVENT. The Sunday letter is The Log. salon-invite's description
      is realigned with the letter it actually renders, which is port-invite.

      voyage-cancelled's description is left as it stands: "Called off, and
      credited in full." is accurate, carries no retired term, and matches a
      subject line that did not change.

   ON THE GUARD, because this block breaks the house pattern deliberately.
   The usual shape here is "raise if zero rows matched", and a first cut of
   this migration used it — which failed the replay on its first run, because
   the automations row is OPERATOR data. It was written through the Bridge on
   2026-08-21, no migration seeds it, and an empty database rebuilt from this
   corpus therefore has nothing to correct. Asserting a match would make the
   corpus unable to rebuild itself, which is the one thing it must be able to
   do.

   So each correction asserts the ABSENCE of the retired shape instead. That
   is strictly stronger than a row count for an idempotent data fix: it cannot
   pass silently on a database that still carries the old copy, it stays green
   when re-applied to one already corrected, and it is honest about the case
   where the row simply is not there. The marks and email_templates rows ARE
   migration-seeded, so on a replay they match and are corrected as normal —
   the absence check covers all three the same way. */
do $mig$
begin
  update public.automations
     set name   = 'Global members: cabin choice on episodes',
         action = jsonb_set(action, '{title}', '"Cabin choice is open — {episode}"'::jsonb)
   where name = 'Global members: cabin choice on sailings'
     and action->>'title' = 'Cabin choice is open — {voyage}';

  update public.marks
     set blurb = 'Sailed out of every open city.'
   where code = 'full-compass' and blurb = 'Sailed out of every open harbor.';

  update public.email_templates
     set description = 'The Log, Sundays.'
   where code = 'lore-digest' and description = 'Episodes, Sundays.';

  update public.email_templates
     set description = 'The Log, Sundays (legacy key, still queued rows).'
   where code in ('dispatch-digest', 'episode-digest')
     and description = 'Episodes, Sundays (legacy key, still queued rows).';

  update public.email_templates
     set description = 'Come ashore once, as our guest (legacy key, still queued rows).'
   where code = 'salon-invite' and description = 'An invitation to a Table.';

  if exists (
    select 1 from public.automations
     where name like '%sailing%' or action::text like '%{voyage}%'
  ) then
    raise exception 'an automation rule still carries a retired noun or token';
  end if;

  if exists (select 1 from public.marks where blurb ~ 'harbor') then
    raise exception 'a mark blurb still says harbor';
  end if;

  if exists (
    select 1 from public.email_templates
     where description ~ '(Episodes, Sundays|invitation to a Table)'
  ) then
    raise exception 'a template description still names the retired digest';
  end if;
end $mig$;;
