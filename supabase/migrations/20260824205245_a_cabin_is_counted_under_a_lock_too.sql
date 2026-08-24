-- Berths were put under a lock. Chairs at a table were put under a lock. The
-- cabin — the named space on the hull that a member picks by name — was
-- counted with nothing between the count and the write, and it was the one
-- nobody came back to.
--
-- Worse than the others in one respect: the berth guard at least rode
-- `rsvp_guard`, which takes the voyage lock. The cabin guard is on a SEPARATE
-- trigger keyed to `update of cabin_id`, and `chooseCabin` updates cabin_id
-- alone — so `rsvp_guard` never fires on that path and no lock is taken at
-- any point. There is no unique index underneath either: rsvp_addons,
-- table_seats and rsvps(voyage_id, profile_id) all have one; cabins had
-- nothing.
--
-- Reproduced before fixing: four members, barrier-synchronised, onto the same
-- two-berth cabin, fifteen rounds — five oversold, one admitting all four with
-- four HTTP 204s, and the oversell stuck in the table afterwards. The comment
-- above chooseCabin said "the capacity guard at the database refuses a full
-- cabin, so two members picking the owner's cabin at once resolves honestly."
-- It did not. A member picked a named cabin, was told yes, and would have
-- arrived to find someone else in the berth.
--
-- The lock is on the CABIN AND VOYAGE, not the member: a capacity question is
-- about the thing being filled, and a per-member lock never makes two
-- claimants meet. Reproduced from pg_get_functiondef, not from a description.
create or replace function public.guard_cabin_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  cap integer;
  taken integer;
begin
  if new.cabin_id is null or new.cabin_id is not distinct from old.cabin_id then
    return new;
  end if;

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

-- The guard only fires on `update of cabin_id`, so a row that arrives already
-- carrying a cabin AND later becomes `aboard` through a status change slips
-- past it. Count it on the way into `aboard` as well.
drop trigger if exists rsvp_cabin_capacity on public.rsvps;
create trigger rsvp_cabin_capacity
before insert or update of cabin_id, status on public.rsvps
for each row execute function public.guard_cabin_capacity();
;
