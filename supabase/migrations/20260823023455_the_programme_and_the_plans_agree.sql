-- The Season II sea programme was entirely odyssey-class while every member on
-- the roll held a tier-II (expedition) plan — so claiming a pass was impossible
-- for the whole roll, while the pass meter kept promising events a month. Three
-- seeded members were also aboard odyssey sailings their own plan forbids.
update public.voyages
set sub_class = 'expedition'
where slug = 'regatta-day-one' and sub_class = 'odyssey';

update public.profiles p
set plan_id = deep.id
from public.membership_plans mine
join public.membership_plans deep
  on deep.plan_type = mine.plan_type and deep.tier = 3
where p.plan_id = mine.id
  and exists (
    select 1
    from public.rsvps r
    join public.voyages v on v.id = r.voyage_id
    where r.profile_id = p.id
      and r.status = 'aboard'
      and v.sub_class = 'odyssey'
  );
