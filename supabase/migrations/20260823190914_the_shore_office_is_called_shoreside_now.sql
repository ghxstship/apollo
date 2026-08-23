-- "Shore office" is on the retired list; the shore office is Shoreside. The
-- row stored it upper-cased, and the lexicon grep is case-sensitive, so it sat
-- on the Crew screen unnoticed — the same way "berth" sat on the Bridge for
-- three rounds.
update public.crew_roles
   set meta = regexp_replace(meta, 'shore office', 'Shoreside', 'i')
 where meta ilike '%shore office%';;
