/* The Series rename reaches the data. Retiring a word in code is still a red
   build while a row prints it: the flagship catalogue entry described itself as
   the anchor format, which is the exact production word the rename removed, and
   it renders on the series catalogue and on every Sandbar Social card.

   Anchored on the old sentence rather than blind-set, so a re-run after the
   copy is edited by hand does not quietly stamp over the newer wording. */
do $$
declare touched int;
begin
  update public.activity_formats
     set blurb = 'The anchor series. Seven hours, Miami to Haulover and back.'
   where slug = 'sandbar'
     and blurb = 'The anchor format. Seven hours, Miami to Haulover and back.';
  get diagnostics touched = row_count;
  if touched = 0 then
    raise notice 'sandbar blurb already off the old wording — nothing to do';
  end if;
end $$;;
