-- Two live functions still speak Lyre: charge_shop_order writes 'The Chandlery'
-- into every house-account memo (which is why the ledger kept regrowing banned
-- prose after the data migration), and the profile-column guard raises an error
-- naming the Passbook. The short 'berth'/'berths' literals elsewhere are jsonb
-- keys and dedup guards — plumbing, not display — and stay.

create or replace function public.charge_shop_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.shop_orders where id = p_order;
  if o.id is null then raise exception 'no such order'; end if;
  insert into public.account_ledger (profile_id, delta_cents, kind, memo)
  values (o.profile_id, -(o.total_cents), 'shop', 'The Slop Chest');
end $$;
revoke execute on function public.charge_shop_order(uuid) from public, anon, authenticated;

-- Same guard, one message re-voiced.
create or replace function public.guard_privileged_profile_columns()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  if new.is_staff is distinct from old.is_staff then
    raise exception 'staff standing is not yours to grant';
  end if;
  if new.tier is distinct from old.tier then
    raise exception 'membership tier moves from the Bridge, not from here';
  end if;
  if new.status is distinct from old.status then
    raise exception 'membership standing moves from the Bridge, not from here';
  end if;
  if new.plan_id is distinct from old.plan_id then
    raise exception 'a plan changes through billing, not by hand';
  end if;
  if new.member_no is distinct from old.member_no then
    raise exception 'a member number is issued once';
  end if;
  if new.email is distinct from old.email then
    raise exception 'the address on file changes through the gangway';
  end if;
  if new.joined_at is distinct from old.joined_at then
    raise exception 'the date you came aboard is a matter of record';
  end if;
  if new.calendar_token is distinct from old.calendar_token then
    raise exception 'the season feed rotates from your member card, not by hand';
  end if;
  if new.stripe_customer_id is distinct from old.stripe_customer_id
     and coalesce(current_setting('app.claim_stripe', true), 'off') <> 'on' then
    raise exception 'the billing account on file is not yours to set';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_privileged_profile_columns() from public, anon, authenticated;

-- Rows the old memo wrote since the data pass.
update public.account_ledger set memo = replace(memo, 'Chandlery', 'Slop Chest') where memo like '%Chandlery%';
