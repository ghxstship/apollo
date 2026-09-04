-- Nobody has been able to sign up since the Model C ladder landed on the 2nd.
-- handle_new_user() picks the default plan with "plan_type = tier and tier = 2"
-- and never asks whether the plan is live, so the retired Regional · Expedition
-- and the live Cabin both answer, the subquery returns two rows, and the insert
-- into auth.users aborts. The partial unique index that keeps one live plan per
-- slot cannot see a retired twin. Read the live plan only, and prove the slots
-- are single before trusting the fix. Found by the 2026-09-04 database audit,
-- reproduced on a replay: the first test fixture's auth.users insert died on it.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p where p.proname = 'handle_new_user' and p.pronamespace = 'public'::regnamespace;
  if src is null or src not like '%and mp.tier = 2)%' then
    raise exception 'handle_new_user does not read as expected — trace its rewrites before patching';
  end if;
  src := replace(src, 'and mp.tier = 2)',
                      'and mp.tier = 2 and mp.active order by mp.published desc, mp.price_cents limit 1)');
  execute src;
end $$;

do $$
declare n int;
begin
  select count(*) into n from (
    select plan_type, tier from public.membership_plans where active group by 1, 2 having count(*) > 1
  ) d;
  if n > 0 then raise exception '% (plan_type, tier) slots still hold more than one live plan', n; end if;
end $$;;
