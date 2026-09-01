-- Two BEFORE-DELETE knots reversals stood on voyages: return_knots_before_the_
-- sailing_goes (older, nets per profile across the whole voyage ledger) and
-- the_knots_leave_before_the_ship (added 20260901151744 without noticing the
-- first — the very two-triggers shape the hardening log warns about). Normal
-- deletes survived by luck: the alphabet fired the old one first and the new
-- one then summed zero. A CANCELLED sailing did not: the old one is blind to
-- the -'Sailing cancelled' clawback and reversed the same 25 Knots a second
-- time at the delete. One guard stays — the broader one — and it counts all
-- four reasons, as close_out_a_cancelled_sailing already does.
do $$
declare
  src text := pg_get_functiondef('public.return_knots_before_the_sailing_goes()'::regprocedure);
  anchor text := $a$and f.reason in ('Berth confirmed', 'Pass confirmed', 'Pass released')$a$;
begin
  if position(anchor in src) = 0 then
    raise exception 'anchor missing in return_knots_before_the_sailing_goes — read the live function before patching';
  end if;
  src := replace(src, anchor,
    $a$and f.reason in ('Berth confirmed', 'Pass confirmed', 'Pass released', 'Sailing cancelled')$a$);
  execute src;
end $$;

drop trigger if exists the_knots_leave_before_the_ship on public.voyages;
drop function if exists public.the_knots_leave_before_the_ship();;
