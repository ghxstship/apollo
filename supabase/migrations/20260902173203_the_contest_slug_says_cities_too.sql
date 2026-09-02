/* The slug was left alone in the previous migration on the reasoning that a
   slug is an address rather than copy. That reasoning was wrong here, and the
   e2e suite proved it: the Bridge contest board prints each contest's own path
   as visible text beside its title, so the card read Both cities before autumn
   directly above /regattas/both-harbors. A slug that renders IS copy.

   Seed data with no entries behind it and no member holding the link, so this
   moves rather than earning a redirect. */
do $$
declare n int;
begin
  update public.contests set slug = 'both-cities'
   where slug = 'both-harbors';
  get diagnostics n = row_count;
  if n = 0 then
    raise notice 'contest slug already moved';
  end if;
end $$;;
