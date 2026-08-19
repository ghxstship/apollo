-- A Knots sink already existed: public.rewards + redeem_reward, wired into the
-- Portal. knot_offers was a second one built without noticing, so it goes; the
-- catalogue it carried moves into rewards and the original RPC is hardened.
--
-- Three defects fixed in redeem_reward while it is open:
--   1. no lock — two tabs could both pass the balance check and overdraw
--   2. no stock cap — nothing could be limited to a fixed number
--   3. its notification said "shore office", which is a banned term

alter table public.rewards
  add column if not exists stock integer check (stock is null or stock >= 0);

comment on column public.rewards.stock is
  'null = unlimited; otherwise the number that may ever be redeemed';

-- Carry over the catalogue, matching on name so a re-run is a no-op.
insert into public.rewards (name, detail, cost_fm, active, position)
select v.name, v.detail, v.cost, true, v.position
from (values
  ('Hold a pass past release',
   'Your pass stays held twenty-four hours past the release deadline.', 150, 4),
  ('Choice of cabin',
   'Pick your cabin on a Sea Day before the flotilla is assigned.', 300, 5),
  ('Twenty-five dollars at the Chandlery',
   'Credit against anything on the shelf.', 500, 6)
) as v(name, detail, cost, position)
where not exists (select 1 from public.rewards r where r.name = v.name);

drop function if exists public.redeem_knot_offer(text);
drop table if exists public.knot_redemptions;
drop table if exists public.knot_offers;

create or replace function public.redeem_reward(p_reward uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  me    uuid := auth.uid();
  rw    record;
  bal   int;
  taken int;
begin
  if me is null then raise exception 'sign in first'; end if;

  -- Serialise this member's spending. Without it two concurrent redemptions
  -- both read the pre-spend balance and both succeed. Transaction-scoped.
  perform pg_advisory_xact_lock(hashtext(me::text));

  select * into rw from public.rewards where id = p_reward and active;
  if rw.id is null then raise exception 'no such reward'; end if;

  select coalesce(sum(delta), 0) into bal
  from public.fathoms_ledger where profile_id = me;
  if bal < rw.cost_fm then
    raise exception 'not enough knots: % held, % needed', bal, rw.cost_fm;
  end if;

  if rw.stock is not null then
    select count(*) into taken from public.reward_redemptions where reward_id = rw.id;
    if taken >= rw.stock then raise exception 'that one is spoken for'; end if;
  end if;

  insert into public.reward_redemptions (profile_id, reward_id) values (me, rw.id);
  insert into public.fathoms_ledger (profile_id, delta, reason)
  values (me, -rw.cost_fm, 'Redeemed — ' || rw.name);
  insert into public.notifications (profile_id, kind, title, body)
  values (me, 'fathoms', 'Redeemed — ' || rw.name, 'Shoreside will arrange it.');
end;
$$;

revoke execute on function public.redeem_reward(uuid) from public, anon;
grant execute on function public.redeem_reward(uuid) to authenticated;
