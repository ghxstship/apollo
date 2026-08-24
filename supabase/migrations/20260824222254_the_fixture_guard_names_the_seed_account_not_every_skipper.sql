-- The fixture guard held back any address beginning `skipper@` AT ANY DOMAIN.
-- The intent was the seeded demo account, skipper@syrius.social. The rule as
-- written also silences skipper@anything-else — and this is a sailing club,
-- where "skipper@" is an entirely plausible address for a real person to hold.
-- That member would receive no boarding pass, no weather hold, no cancellation,
-- and nothing anywhere would say so: the row is marked `skipped`, which the
-- Bridge shows as a number in the thousands that nobody reads.
--
-- Nothing has been lost yet — the 78 suppressed letters are all the seed
-- account, which I checked rather than assumed. The rule is narrowed to the
-- account it meant.
--
-- The guard also now records WHICH clause matched. A suppression that cannot be
-- explained is one nobody can argue with, and the reason is the difference
-- between "we held this back on purpose" and "a member stopped getting mail".
create or replace function public.no_real_mail_to_a_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  addr text := lower(coalesce(new.to_email, ''));
  why  text;
begin
  if addr = '' or position('@' in addr) < 2 then
    why := 'not a deliverable address';
  elsif addr ~ '^(e2e|test|probe|audit|fixture|smoke|viewport|qa)[-.]' then
    why := 'reserved fixture prefix';
  elsif addr ~ '[-.](audit|probe|fixture|smoke|test)@' then
    why := 'reserved fixture suffix';
  elsif addr = 'skipper@syrius.social' then
    -- Named exactly. `skipper@%` also silenced skipper@ at every other domain.
    why := 'the seeded demo account';
  elsif addr like '%@demo.%'
     or addr like '%@lyre.social'
     or addr like '%@example.com'
     or addr like '%@example.org'
     or addr like '%@example.net'
     or addr like '%.test'
     or addr like '%.invalid'
     or addr like '%.localhost'
  then
    why := 'reserved fixture domain';
  end if;

  if why is not null then
    new.status := 'skipped';
    new.last_error := 'fixture address — not sent (' || why || ')';
  end if;
  return new;
end;
$function$;
;
