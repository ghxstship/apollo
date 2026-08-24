-- The comment above the lock in this function is correct and the lock does
-- exactly what it says: it serialises THIS MEMBER'S spending, so a member
-- cannot spend the same knots twice. The stock check two statements below it
-- is not covered by that at all, and the function does not say so.
--
-- A per-member lock never makes two claimants meet. That sentence is already
-- written in this schema — migration 20260823215305, where the same mistake
-- was found in claim_table_seat — and it applies here word for word.
--
-- Reproduced by the crawl on the unfixed function: a reward with stock = 1,
-- four members firing at once, four HTTP 204s and four redemptions recorded
-- within 3.1 milliseconds, forty knots taken for one item.
--
-- HONEST ABOUT REACHABILITY: there are no rewards with a stock limit today, so
-- nothing has actually been oversold. This is latent, and it fires the first
-- time someone puts a genuinely limited item in the Knots catalogue — which is
-- the moment nobody will be watching for it.
--
-- Two locks, because there are two distinct questions. The member lock stays
-- exactly as it is. A lock on the REWARD is added for the stock count, ordered
-- after the member lock so every caller takes them in the same order and no
-- two transactions can hold one while waiting for the other.
create or replace function public.redeem_reward(p_reward uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me    uuid := auth.uid();
  rw    record;
  bal   int;
  taken int;
begin
  if me is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;

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
    -- Everyone reaching for THIS reward queues here, which is the only way two
    -- claimants for one item ever meet. Always taken after the member lock, so
    -- the acquisition order is the same for every caller.
    perform pg_advisory_xact_lock(hashtext('reward:' || rw.id::text));

    select count(*) into taken from public.reward_redemptions where reward_id = rw.id;
    if taken >= rw.stock then raise exception 'that one is spoken for'; end if;
  end if;

  insert into public.reward_redemptions (profile_id, reward_id) values (me, rw.id);
  insert into public.fathoms_ledger (profile_id, delta, reason)
  values (me, -rw.cost_fm, 'Redeemed — ' || rw.name);
  insert into public.notifications (profile_id, kind, title, body)
  values (me, 'fathoms', 'Redeemed — ' || rw.name, 'Shoreside will arrange it.');
end;
$function$;
;
