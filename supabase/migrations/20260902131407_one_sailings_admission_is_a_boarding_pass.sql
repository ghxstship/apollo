/* What admits you to one sailing is a boarding pass (decided 2026-09-02).

   The schema has half-said this for months — rsvps.boarding_code is the thing
   the gangway scans, and /stub is the boarding stub — while the copy said
   "pass", which is also the word for a monthly allowance, a plan entitlement
   and a thing on a waitlist. Boarding pass names the credential and leaves
   "passes" free to stay the countable noun. */
do $$
begin
  if exists (select 1 from pg_trigger
             where tgname = 'zz_record_the_change' and tgrelid = 'public.club_products'::regclass) then
    execute 'alter table public.club_products disable trigger zz_record_the_change';
  end if;

  update public.club_products set label = 'Single boarding pass' where slug = 'single_pass';
  update public.club_products set label = 'Couple boarding pass' where slug = 'couple_pass';

  if exists (select 1 from pg_trigger
             where tgname = 'zz_record_the_change' and tgrelid = 'public.club_products'::regclass) then
    execute 'alter table public.club_products enable trigger zz_record_the_change';
  end if;
end $$;;
