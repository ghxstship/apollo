-- The previous migration re-voiced charge_shop_order from memory of its shape
-- and got the shape wrong: the real thing is a TRIGGER function with signature
-- (), so a new (uuid) overload was created — never called by anything — while
-- the genuine trigger kept writing 'The Chandlery', with different accounting
-- (net of discount, which is the corrected post-double-discount behavior).
--
-- Drop the stray; replace the real one with its exact original body, memo only.
drop function if exists public.charge_shop_order(uuid);

create or replace function public.charge_shop_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.total_cents > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, created_by)
    values (new.profile_id, -(new.total_cents - new.discount_cents), 'chandlery', 'The Slop Chest', new.profile_id);
  end if;
  return new;
end $$;
revoke execute on function public.charge_shop_order() from public, anon, authenticated;

update public.account_ledger set memo = replace(memo, 'Chandlery', 'Slop Chest') where memo like '%Chandlery%';
