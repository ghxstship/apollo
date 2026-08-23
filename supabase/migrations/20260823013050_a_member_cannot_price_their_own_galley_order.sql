-- galley_orders had no column guard at all: a member could insert a self-priced
-- order and be charged whatever they wrote. The galley runs off a tab taken by
-- the crew, so a member has no business inserting one directly at all — the POS
-- writes them from the Bridge.
drop policy if exists "own galley order" on public.galley_orders;
drop policy if exists "place galley order" on public.galley_orders;
drop policy if exists "members order galley" on public.galley_orders;

do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.galley_orders'::regclass and polname = 'staff run the galley'
  ) then
    create policy "staff run the galley" on public.galley_orders
      for insert to authenticated
      with check (public.is_staff());
  end if;
end $$;

-- And the charge never pays out, whatever lands in the row.
create or replace function public.charge_galley_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(new.total_cents, 0) > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, created_by)
    values (new.profile_id, -new.total_cents, 'galley', 'Galley order', new.voyage_id, new.profile_id);
  end if;
  return new;
end $function$;
