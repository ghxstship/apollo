-- comped_until was added on the 4th and left out of the guard over the
-- profile's privileged columns, so a member could PATCH their own dues
-- waiver to 2099 — reproduced by the lifecycle tests. The rule from the
-- hardening notes: a new column does not join an existing guard by itself.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'guard_privileged_profile_columns' and p.pronamespace = 'public'::regnamespace;
  if src not like '%  if new.stripe_customer_id is distinct from old.stripe_customer_id%' then
    raise exception 'guard_privileged_profile_columns: anchor missing — re-read before patching';
  end if;
  src := replace(src, '  if new.stripe_customer_id is distinct from old.stripe_customer_id',
'  if new.comped_until is distinct from old.comped_until then
    raise exception ''complimentary dues are the Bridge''''s to give'';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id');
  execute src;
end $$;;
