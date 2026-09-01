-- cabins.premium_cents has said "surcharge over the charter's pass price"
-- since the table was born, and no ledger row has ever carried it: the member
-- read "+$80", took the Owner's cabin, and the folio never heard. The premium
-- now posts when a place in the cabin is taken, and is handed back when the
-- member moves to another cabin or gives the cabin up while still aboard.
-- (Releasing the whole pass already credits every charge on it 48h+ out —
-- that machinery is untouched and covers the premium the same as the berth.)
-- A comp pass skips the charge, as it skips every other charge.
create or replace function public.a_cabin_costs_its_premium()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  net integer;
  cab record;
begin
  -- Only cabin movements while aboard are priced here; status transitions
  -- (release, promotion) belong to the machinery that already owns them.
  if new.status <> 'aboard' or coalesce(new.comp, false) then return new; end if;
  if tg_op = 'UPDATE' and old.cabin_id is not distinct from new.cabin_id then return new; end if;

  -- Hand back what the old cabin was charged, if anything stands uncredited.
  if tg_op = 'UPDATE' and old.cabin_id is not null then
    select coalesce(-sum(delta_cents), 0) into net
    from public.account_ledger
    where rsvp_id = new.id and memo like 'Cabin — %';
    if net > 0 then
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
      select new.profile_id, net, 'credit', 'Cabin — given up', new.voyage_id, new.id, new.profile_id;
    end if;
  end if;

  if new.cabin_id is not null then
    select c.name, c.premium_cents into cab from public.cabins c where c.id = new.cabin_id;
    if cab.premium_cents > 0 then
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, created_by)
      values (new.profile_id, -cab.premium_cents, 'addon', 'Cabin — ' || cab.name,
              new.voyage_id, new.id, new.profile_id);
    end if;
  end if;

  return new;
end $$;

revoke execute on function public.a_cabin_costs_its_premium() from public, anon, authenticated;

-- AFTER guard_cabin_capacity (alphabetical order is load-bearing here and
-- documented: 'a_cabin_...' < 'rsvp_cabin_capacity' would price a claim the
-- capacity guard is about to refuse — but a refusal aborts the whole
-- statement, ledger row included, so either order is safe; BEFORE is chosen
-- so the row and its charge land in one visible frame).
create trigger a_cabin_costs_its_premium
  before insert or update of cabin_id on public.rsvps
  for each row execute function public.a_cabin_costs_its_premium();;
