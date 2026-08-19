-- Second finding of the same class as the profiles escalation: a policy that
-- says WHICH ROW but not WHICH COLUMNS.
--
-- shop_orders carries "member requests refund" FOR UPDATE USING profile_id =
-- auth.uid(). The name states the intent; the policy grants far more. A member
-- could mark their own Chandlery order `refunded` and rewrite total_cents to 1
-- in the same request — verified against the live API before this fix.
--
-- A member may do exactly one thing to a placed order: ask for a refund. Whether
-- it is granted is the Bridge's call.

create or replace function public.guard_shop_order_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  if new.profile_id is distinct from old.profile_id then
    raise exception 'an order stays with the member who placed it';
  end if;
  if new.total_cents is distinct from old.total_cents
     or new.discount_cents is distinct from old.discount_cents then
    raise exception 'what an order cost is not yours to restate';
  end if;
  -- The one move a member may make, and only from a placed order.
  if new.status is distinct from old.status
     and not (old.status = 'placed' and new.status = 'refund_requested') then
    raise exception 'a refund is requested here and granted from the Bridge';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_shop_order_columns on public.shop_orders;
create trigger guard_shop_order_columns
before update on public.shop_orders
for each row execute function public.guard_shop_order_columns();

-- The guards are trigger functions; nothing should hold EXECUTE on them. Caught
-- by the trigger_fn_not_granted invariant on its own first run.
revoke execute on function public.guard_privileged_profile_columns() from public, anon, authenticated;
revoke execute on function public.guard_shop_order_columns() from public, anon, authenticated;
