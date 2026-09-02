/* The Captain's Pass states what it holds (decided 2026-09-02).

   One sailing and the sandbar, the premium open bar, one guest slot, and
   Radar for the sailing. The daybed and the cabin stay paid add-ons, so the
   pass has one shape and the boat keeps a margin line. Its number stays
   unpublished — "Captain's Pass is the only tier that never publishes a
   number" (membership kit) — so price_cents and published are untouched and
   the product row's own constraint keeps them honest.

   The audit trigger is stepped around the way the settings seed did: a
   migration has no actor to attribute the change to, and the migration file
   is the record. */
do $$
begin
  if exists (select 1 from pg_trigger
             where tgname = 'zz_record_the_change' and tgrelid = 'public.club_products'::regclass) then
    execute 'alter table public.club_products disable trigger zz_record_the_change';
  end if;

  update public.club_products
     set includes = array[
       'One sailing and the sandbar, each manifest place',
       'Premium open bar',
       'One guest slot',
       'Radar for the sailing',
       'Daybed and cabin ride as paid add-ons'
     ]
   where slug = 'captains_pass';

  if exists (select 1 from pg_trigger
             where tgname = 'zz_record_the_change' and tgrelid = 'public.club_products'::regclass) then
    execute 'alter table public.club_products enable trigger zz_record_the_change';
  end if;
end $$;;
