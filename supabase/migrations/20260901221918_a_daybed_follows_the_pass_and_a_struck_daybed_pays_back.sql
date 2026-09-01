-- What the pass carries follows the pass: crew_seat_follows_the_pass already
-- says so for the crew seat; the daybed row said nothing and kept the giver's
-- name after a hand-off, so the steward's list and the folio disagreed.
create or replace function public.daybed_follows_the_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if old.profile_id is distinct from new.profile_id then
    update public.voyage_daybeds set profile_id = new.profile_id where rsvp_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.daybed_follows_the_pass() from public, anon, authenticated;
create trigger daybed_follows_the_pass
  after update of profile_id on public.rsvps
  for each row execute function public.daybed_follows_the_pass();

-- A daybed the Bridge strikes while the pass still stands was a charge with
-- nothing held against it. Struck by hand, the folio is squared here; struck
-- by the pass leaving (cascade), the release machinery has already credited
-- everything on the pass, and the parent row is gone by the time this fires,
-- so the exists() below keeps the two paths from crediting twice.
create or replace function public.a_struck_daybed_pays_back()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare net integer;
begin
  if not exists (select 1 from public.rsvps r where r.id = old.rsvp_id and r.status = 'aboard') then
    return old;
  end if;
  select coalesce(-sum(delta_cents), 0) into net
  from public.account_ledger
  where rsvp_id = old.rsvp_id and memo like 'Bow daybed%';
  if net > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
    values (old.profile_id, net, 'credit', 'Bow daybed — struck, credited in full', old.voyage_id, old.rsvp_id);
  end if;
  return old;
end $$;
revoke execute on function public.a_struck_daybed_pays_back() from public, anon, authenticated;
create trigger a_struck_daybed_pays_back
  after delete on public.voyage_daybeds
  for each row execute function public.a_struck_daybed_pays_back();;
