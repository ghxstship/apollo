/* The final retired noun in operator-visible copy. club_settings.note renders
   beside the figure on the Bridge's keys console, so an operator reading what
   the match guarantee is FOR met the word the club stopped using in September.

   Absence-asserted rather than row-counted: this is a data fix on a row a
   migration seeded once, and a guard that demands exactly one match fails on
   replay the moment somebody edits the note by hand. What matters is that the
   retired word is gone, not that this particular statement is the one that
   removed it. */
update public.club_settings
   set note = 'Credit when a Radar episode yields no shared anchors'
 where key = 'match_guarantee_cents'
   and note = 'Credit when a Radar sailing yields no shared anchors';

do $$
declare stragglers text;
begin
  select string_agg(key, ', ')
    into stragglers
  from public.club_settings
  where note ~* '\msailing\M|\mharbor|\mmanifest\M';
  if stragglers is not null then
    raise exception 'club settings still carrying a retired noun: %', stragglers;
  end if;
end $$;;
