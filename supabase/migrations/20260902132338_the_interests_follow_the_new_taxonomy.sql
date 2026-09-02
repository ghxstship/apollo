/* Stored interests carry the retired words (2026-09-02).

   profiles.interests is free text chosen from a fixed list the /you page
   offers, and the directory renders it verbatim. Renaming the option labels in
   the UI would have left every existing member advertising "Sea Days" on their
   own profile page — and the lexicon gates read rendered HTML, so the ban
   would have been tripped by data rather than by code, which is the hardest
   kind of gate failure to find.

   Sailings and Shore nights, matching what the picker now offers. Members who
   never chose either are untouched. */
update public.profiles
   set interests = array_replace(interests, 'Sea Days', 'Sailings')
 where 'Sea Days' = any(interests);

update public.profiles
   set interests = array_replace(interests, 'Port Days', 'Shore nights')
 where 'Port Days' = any(interests);;
