/* The last of it: values, not names.

   account_ledger.kind stored 'berth' for the line a pass writes and 'chandlery'
   for a shop charge. Both are banned terms the brand layer was translating away
   on every render, which is exactly the arrangement the owner asked to end.
   contests compared against 'harbors' and 'sailings' for the same reason.

   ORDER MATTERS and this migration failed once for getting it wrong: the CHECK
   has to be dropped BEFORE the update, or the constraint refuses the very value
   the update is writing.

   The rebuilt CHECK carries 'dues', which the first draft silently dropped
   because it was written from the brand layer's LEDGER_KIND map rather than
   from the constraint itself. Read the constraint, not the display map. */

alter table public.account_ledger drop constraint if exists account_ledger_kind_check;
alter table public.contests drop constraint if exists contests_metric_check;

do $$
declare n int; total int := 0;
begin
  update public.account_ledger set kind = 'pass' where kind = 'berth';
  get diagnostics n = row_count; total := total + n;
  raise notice 'account_ledger berth -> pass: % rows', n;

  update public.account_ledger set kind = 'shop' where kind = 'chandlery';
  get diagnostics n = row_count; total := total + n;

  update public.contests set metric = 'cities' where metric = 'harbors';
  get diagnostics n = row_count; total := total + n;

  update public.contests set metric = 'episodes' where metric = 'sailings';
  get diagnostics n = row_count; total := total + n;

  raise notice 'value rename touched % rows in total', total;
end $$;

alter table public.account_ledger add constraint account_ledger_kind_check
  check (kind = any (array['pass','deposit','addon','galley','shop','dues','credit','refund','payment']));

alter table public.contests add constraint contests_metric_check
  check (metric = any (array['nm','episodes','cities','vessels','crew_met','frames']));;
