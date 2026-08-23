-- 25 Knots land when a pass is confirmed and nothing takes them back when it is
-- released. Book and release across sailings and the Knots accumulate for zero
-- attendance and zero money — and Knots buy "first call on scarce passes", so
-- the currency of scarcity was farmable by anyone with an afternoon.
--
-- The award stays where it is (a member should see it when they book, not
-- weeks later at the gangway); it is simply given back when the pass is.
create or replace function public.return_knots_with_the_pass()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare gone uuid; awarded int;
begin
  if tg_op = 'DELETE' then
    gone := old.profile_id;
  elsif old.profile_id is distinct from new.profile_id then
    gone := old.profile_id;                        -- handed on
  elsif old.status = 'aboard' and new.status <> 'aboard' then
    gone := old.profile_id;                        -- released
  else
    return coalesce(new, old);
  end if;

  -- Still holding another pass on the same sailing? Then nothing was given up.
  if exists (
    select 1 from public.rsvps r
    where r.profile_id = gone and r.voyage_id = old.voyage_id
      and r.status = 'aboard' and r.id <> old.id
  ) then
    return coalesce(new, old);
  end if;

  select coalesce(sum(delta), 0) into awarded
  from public.fathoms_ledger
  where profile_id = gone and voyage_id = old.voyage_id
    and reason in ('Berth confirmed', 'Pass confirmed', 'Pass released');

  if awarded > 0 then
    insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
    values (gone, -awarded, 'Pass released', old.voyage_id);
  end if;

  return coalesce(new, old);
end;
$$;

revoke execute on function public.return_knots_with_the_pass() from public, anon, authenticated;

drop trigger if exists return_knots_with_the_pass on public.rsvps;
create trigger return_knots_with_the_pass
  after delete or update of status, profile_id on public.rsvps
  for each row execute function public.return_knots_with_the_pass();;
