/* The last two rows the City rename had not reached, both found by the e2e
   suite rather than the route audit because both sit behind a sign-in.

   The contest is the clearest case in the whole rename: it is literally about
   sailing out of Miami and out of Los Angeles, which are cities, and it called
   them harbors three times in one card. The slug stays — it is an address
   members may already hold, and a slug is not copy.

   The jacket is a judgement call rather than a correction. Harbor shell is
   defensible nautical product naming, and the ban exists for location labels,
   not for merchandise. It is renamed anyway because a gate with a carve-out
   for whichever string is inconvenient stops being a gate, and this is seed
   catalogue data with no order history behind it. Deck is the club's own word
   and the Open Deck already carries it. */
do $$
declare n int; total int := 0;
begin
  update public.contests
     set title = 'Both cities before autumn.',
         blurb = 'Sail out of Miami and out of Los Angeles inside the same season. Two cities, one log.',
         prize = 'A standing invitation to the founding night in the next city to open.'
   where slug = 'both-harbors'
     and title = 'Both harbors before autumn.';
  get diagnostics n = row_count; total := total + n;

  update public.products
     set name = 'Deck shell jacket'
   where slug = 'harbor-jacket'
     and name = 'Harbor shell jacket';
  get diagnostics n = row_count; total := total + n;

  raise notice 'city rename tail touched % rows', total;
end $$;;
