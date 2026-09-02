/* The remaining retired words, in the rows that print them (2026-09-02).

   A full scan of every text and array column in the schema found six places
   still carrying Sea Day or Port Day. Four are club copy and move here. Two do
   not move, and the distinction is the point:

     signatures.rendered_body (9 rows) — the exact words nine people signed.
       A signature binds to a hash of the body that was rendered to them.
       Rewriting it would leave every one of those hashes disagreeing with the
       text it attests, which is the difference between a record and a claim.
     clause_versions.body (1 row) — the published shore-venue clause. The
       document system publishes a NEXT version when wording changes; it never
       edits the last. Retiring the phrase here is a new clause version and a
       re-sign, which is a decision for whoever owns the paperwork.

   Neither is reachable by an anonymous page, so neither fails a gate. Both are
   recorded here so the next person does not assume they were missed. */

update public.rewards
   set name = replace(name, 'any Port Day', 'any shore night'),
       detail = replace(replace(detail, 'Port Day', 'shore night'), 'Sea Day', 'sailing')
 where name ilike '%port day%' or detail ilike '%port day%' or detail ilike '%sea day%';

update public.promo_codes
   set note = replace(replace(note, 'a first Sea Day', 'a first sailing'), 'Port Day', 'shore night')
 where note ilike '%sea day%' or note ilike '%port day%';

update public.automations
   set name = replace(replace(replace(name,
         'Sea Days', 'sailings'), 'Sea Day', 'sailing'), 'Port Day', 'shore night')
 where name ilike '%sea day%' or name ilike '%port day%';

update public.applications
   set interests = array_replace(array_replace(interests, 'Sea Day', 'Sailing'), 'Port Day', 'Shore night')
 where array_to_string(interests, ',') ilike '%sea day%'
    or array_to_string(interests, ',') ilike '%port day%';;
