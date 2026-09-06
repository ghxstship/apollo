-- A pass bought in four draws must not be taxed four times.
--
-- Nothing is wrong today and everything is wrong the moment a city gets a
-- rate, which is why this lands now rather than then.
--
-- The shape of a split, as the code actually does it: the pass charge posts
-- the FULL price as a negative row. Splitting it posts a positive `credit` for
-- the part not yet due, so the member has paid only the down payment. Then
-- draw_installments() posts each later slice as another negative row of kind
-- 'pass', carrying the same episode_id.
--
-- a_charge_carries_its_tax() taxes any negative row whose kind is one of
-- pass/deposit/addon/galley/shop. So: the original charge is taxed on the full
-- price, correctly; the credit is skipped because it is positive, correctly;
-- and then every slice is taxed AGAIN, on money that was already taxed once.
-- A pass split four ways would carry the tax on its whole price plus the tax
-- on three quarters of it. And because the trigger takes the tax OUT of
-- delta_cents rather than adding to it, the slices are tax on a tax-inclusive
-- base — so the member is short by a compounding amount and the club's own
-- figure for what it owes the state is wrong in the same direction.
--
-- The taxable event is the purchase. The slices are how it is paid for, and
-- financing a purchase is not a second supply. So the slices need to be a kind
-- the trigger does not tax, and they need to still read as what they are on a
-- member's statement -- which rules out reusing 'payment' (that is money
-- arriving) or 'credit' (that is money going the other way).
--
-- 'installment' joins the eleven kinds already there. It is deliberately NOT
-- added to the taxed list in a_charge_carries_its_tax: that list is the
-- definition of a taxable supply in this schema, and a slice is not one.

alter table public.account_ledger drop constraint if exists account_ledger_kind_check;
alter table public.account_ledger add constraint account_ledger_kind_check
  check (kind = any (array['pass','deposit','addon','galley','shop','dues','credit',
                           'refund','payment','plan_credit','dispute','installment']));

-- The draw posts a slice, not a purchase. Only the two words change; the
-- pacing, the clamping and the notification are the ones already there.
create or replace function public.draw_installments()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare p record; slice int; drawn int := 0;
begin
  for p in
    select ip.*, r.episode_id
    from public.installment_plans ip
    left join public.passes r on r.id = ip.rsvp_id
    where ip.status = 'active'
      and ip.next_charge_at is not null
      and ip.next_charge_at <= now()
    for update of ip
  loop
    slice := ceil((p.total_cents - p.down_payment_cents)::numeric / (p.installments - 1))::int;

    /* 'installment', not 'pass'. The pass was bought once and taxed once; this
       is a slice of that same price arriving later. See the head of this file
       for what taxing it again would have cost the member. */
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id)
    values (p.profile_id, -slice, 'installment',
            'Installment ' || (p.paid_count + 1) || ' of ' || p.installments,
            p.episode_id, p.rsvp_id);

    update public.installment_plans
      set paid_count = paid_count + 1,
          next_charge_at = case when paid_count + 1 >= installments
                                then null
                                -- A month, not thirty days. Thirty days walks
                                -- backwards through the calendar and lands two
                                -- draws in the same month before long.
                                else date_trunc('day', next_charge_at + interval '1 month') end,
          status = case when paid_count + 1 >= installments then 'complete' else 'active' end
      where id = p.id;

    insert into public.notifications (profile_id, kind, title, body)
    values (p.profile_id, 'word', 'An installment was drawn.',
            'Slice ' || (p.paid_count + 1) || ' of ' || p.installments || ' is on your account. No interest, as promised.');

    drawn := drawn + 1;
  end loop;
  return drawn;
end;
$fn$;

revoke all on function public.draw_installments() from public, anon, authenticated;

comment on function public.draw_installments() is
  'Draws every installment slice that has come due. A slice posts as kind ''installment'' and is deliberately outside the set a_charge_carries_its_tax() taxes: the pass was a taxable supply once, at its full price, and financing it is not a second one.';

comment on constraint account_ledger_kind_check on public.account_ledger is
  'The kinds a ledger line may be. ''installment'' is a slice of an already-taxed purchase arriving later, and is not in the taxed set.';

notify pgrst, 'reload schema';
