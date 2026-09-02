/* Editorial and sailing copy carry the retired words (2026-09-02).

   The lexicon gates read RENDERED pages, so a term retired in code is still a
   failing build while it sits in a database row a page prints. Five sailings
   and three published dispatches described themselves as Sea Days and Port
   Days; the route audit failed on eight public URLs until this ran.

   Deliberately NOT touched: clause_versions.body. Two published clauses say
   "Port Days take place at venues the club does not own". That is executed
   legal text — signatures bind to a hash of the exact words rendered, and the
   document system is built so that rewording PUBLISHES A NEXT VERSION rather
   than editing the last. Changing it here would break the hash chain and
   silently alter what people already signed. It needs a new clause version
   and a re-sign, which is a decision, not a find-and-replace. */

update public.voyages
   set blurb = replace(replace(replace(replace(blurb,
         'A Port Day', 'A shore night'), 'Port Day', 'shore night'),
         'flagship Sea Day', 'flagship sailing'), 'A Sea Day', 'A sailing')
 where blurb ilike '%sea day%' or blurb ilike '%port day%';

update public.voyages
   set description = replace(replace(replace(replace(description,
         'A Port Day', 'A shore night'), 'Port Day', 'shore night'),
         'port day', 'shore night'), 'Sea Day', 'sailing')
 where description ilike '%sea day%' or description ilike '%port day%';

update public.dispatch_posts
   set body = replace(replace(replace(replace(replace(replace(body,
         'Sea Days', 'sailings'), 'Port Days', 'shore nights'),
         'Sea Day', 'sailing'), 'Port Day', 'shore night'),
         'sea day', 'sailing'), 'port day', 'shore night')
 where body ilike '%sea day%' or body ilike '%port day%';

update public.dispatch_posts
   set dek = replace(replace(replace(replace(dek,
         'Sea Days', 'sailings'), 'Port Days', 'shore nights'),
         'Sea Day', 'sailing'), 'Port Day', 'shore night')
 where dek ilike '%sea day%' or dek ilike '%port day%';

update public.crew_roles
   set title = replace(title, 'Port Day', 'Shore'),
       blurb = replace(replace(blurb, 'Port Day', 'shore night'), 'Sea Day', 'sailing')
 where title ilike '%port day%' or blurb ilike '%sea day%' or blurb ilike '%port day%';;
