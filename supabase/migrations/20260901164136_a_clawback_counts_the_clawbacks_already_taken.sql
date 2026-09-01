-- Both knots-reversal triggers net ('Berth confirmed','Pass confirmed',
-- 'Pass released') and are blind to the -'Sailing cancelled' rows the cancel
-- trigger posts — so a sailing that was cancelled and later struck reversed
-- the same 25 Knots twice: once at the cancellation, once at the delete.
-- The cancel trigger itself already counts all four reasons (having sum > 0);
-- the other two now count the same four.
do $$
declare
  fn text;
  src text;
  anchor text := $a$and reason in ('Berth confirmed', 'Pass confirmed', 'Pass released');$a$;
begin
  foreach fn in array array['the_knots_leave_before_the_ship()', 'return_knots_with_the_pass()'] loop
    src := pg_get_functiondef(fn::regprocedure);
    if position(anchor in src) = 0 then
      raise exception 'anchor missing in % — read the live function before patching', fn;
    end if;
    src := replace(src, anchor,
      $a$and reason in ('Berth confirmed', 'Pass confirmed', 'Pass released', 'Sailing cancelled');$a$);
    execute src;
  end loop;
end $$;;
