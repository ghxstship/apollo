-- I widened the trigger to fire on `update of status` and the function still
-- returned before counting: its first line exits when cabin_id is unchanged,
-- and a status change leaves cabin_id exactly as it was. The widening was
-- inert — a guard that runs and decides nothing, which is the worst kind,
-- because the trigger definition reads as though the case is covered.
--
-- The real question is not "did the cabin change" but "is this row about to
-- occupy a berth it was not already occupying". Two ways in: the cabin
-- changes, or a row that already names a cabin becomes `aboard`.
create or replace function public.guard_cabin_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cap integer;
  taken integer;
  now_occupies boolean;
  did_occupy boolean;
begin
  if new.cabin_id is null then return new; end if;

  now_occupies := new.status = 'aboard';
  did_occupy := tg_op = 'UPDATE'
                and old.cabin_id is not distinct from new.cabin_id
                and old.status = 'aboard';

  -- Already counted in this cabin and still there: nothing new is claimed.
  if not now_occupies or did_occupy then return new; end if;

  -- Everyone asking about this cabin on this sailing queues here, so the count
  -- below cannot be read by two transactions that then both write.
  perform pg_advisory_xact_lock(
    hashtext('cabin:' || new.cabin_id::text || ':' || new.voyage_id::text));

  select berths into cap from public.cabins where id = new.cabin_id and active;
  if cap is null then raise exception 'no such cabin'; end if;

  select count(*) into taken from public.rsvps
  where voyage_id = new.voyage_id and cabin_id = new.cabin_id
    and status = 'aboard' and id <> new.id;

  if taken >= cap then
    raise exception 'that cabin is spoken for — % berths, all claimed', cap;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_cabin_capacity() from public, anon, authenticated;
;
