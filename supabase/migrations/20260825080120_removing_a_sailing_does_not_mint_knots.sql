-- DELETING A SAILING MINTED SPENDABLE CURRENCY. Found while building on this
-- schema, not by looking for it, and it is pre-existing.
--
-- Two foreign keys to voyages disagree about what should happen:
--   rsvps.voyage_id           ON DELETE CASCADE
--   fathoms_ledger.voyage_id  ON DELETE SET NULL
--
-- return_knots_with_the_pass reverses a member's award when their pass goes,
-- and it finds the award with `where voyage_id = old.voyage_id`. During a
-- voyage delete the ledger rows have their voyage_id NULLED, so by the time the
-- cascade deletes the pass and fires that trigger, the award it is looking for
-- no longer answers to that voyage. It sums zero and reverses nothing.
--
-- Measured: seat a member, then drop the voyage — the +25 stays, orphaned with
-- a null voyage_id. Delete the PASS first and it nets to zero, correctly. So
-- the same act reverses or does not depending on which end you pull, and the
-- end an operator actually uses — cancelling a sailing outright from the
-- Bridge — is the one that leaks.
--
-- Knots are not decoration. They buy real things from a real catalogue through
-- redeem_reward, so this is a mint, and it is reachable by ordinary staff
-- action rather than by anything exotic.
--
-- Fixed BEFORE the cascade rather than inside it. A trigger on voyages runs
-- while the ledger rows still name the sailing, which is the only moment the
-- award is still findable. The per-pass trigger stays exactly as it is — it is
-- correct for every path that does not go through a voyage delete, and this
-- only closes the one that does.
create or replace function public.return_knots_before_the_sailing_goes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record;
begin
  for r in
    select f.profile_id, sum(f.delta) as awarded
    from public.fathoms_ledger f
    where f.voyage_id = old.id
      and f.reason in ('Berth confirmed', 'Pass confirmed', 'Pass released')
    group by f.profile_id
    having sum(f.delta) > 0
  loop
    insert into public.fathoms_ledger (profile_id, delta, reason, voyage_id)
    values (r.profile_id, -r.awarded, 'Pass released', old.id);
  end loop;
  return old;
end;
$$;

revoke all on function public.return_knots_before_the_sailing_goes() from public, anon, authenticated;

drop trigger if exists return_knots_before_the_sailing_goes on public.voyages;
create trigger return_knots_before_the_sailing_goes
  before delete on public.voyages
  for each row execute function public.return_knots_before_the_sailing_goes();
;
