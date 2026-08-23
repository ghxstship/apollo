-- The member is credited perDraw × (n-1) up front and the cron takes it back one
-- slice at a time. It completed at `paid_count + 1 >= installments - 1`, written
-- for a plan seeded at paid_count = 0 — but the booking action seeds 1, counting
-- the down payment as the first installment. So a three- or four-draw split
-- stopped one slice short and the member kept a permanent free credit of exactly
-- one perDraw. Nothing re-tested the pair when the writer changed.
create or replace function public.draw_installments()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p record; slice int; drawn int := 0;
begin
  for p in select * from public.installment_plans
           where status = 'active' and next_charge_at is not null and next_charge_at <= now() loop
    slice := ceil((p.total_cents - p.down_payment_cents)::numeric / (p.installments - 1))::int;
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, rsvp_id)
    values (p.profile_id, -slice, 'berth',
            'Installment ' || (p.paid_count + 1) || ' of ' || p.installments, p.rsvp_id);
    update public.installment_plans
      set paid_count = paid_count + 1,
          next_charge_at = case when paid_count + 1 >= installments
                                then null else next_charge_at + interval '30 days' end,
          status = case when paid_count + 1 >= installments then 'complete' else 'active' end
      where id = p.id;
    insert into public.notifications (profile_id, kind, title, body)
    values (p.profile_id, 'word', 'An installment was drawn.',
            'Slice ' || (p.paid_count + 1) || ' of ' || p.installments || ' is on your account. No interest, as promised.');
    drawn := drawn + 1;
  end loop;
  return drawn;
end $function$;
