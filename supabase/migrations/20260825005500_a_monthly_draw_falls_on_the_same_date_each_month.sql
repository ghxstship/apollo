-- The product sells this as "The rest is drawn monthly" and the notification
-- says "Slice N of M is on your account". Two different cadences implemented
-- it, and neither is monthly.
--
--   The first step used JS `setMonth(getMonth() + 1)`. Ran it: a pass split on
--   Jan 31 draws next on MAR 3. February is skipped entirely. Aug 31 → Oct 1.
--
--   Every later step added `interval '30 days'`. From Sep 1, a four-draw plan
--   falls on Oct 1, Oct 31, Nov 30 — the member is drawn TWICE IN OCTOBER on a
--   plan sold as monthly, against their real folio, on a pass over $200.
--
-- Monthly means the same date each month, and where that date does not exist
-- it means the last day of the month — which is what `+ interval '1 month'`
-- does in Postgres (Jan 31 + 1 month = Feb 28). The first step is aligned to
-- the same rule in the application.
--
-- The draw also inherits the wall-clock time of whenever the split was taken,
-- while the cron runs at 15:00 UTC — so a plan created after 15:00 draws on the
-- day AFTER the date /account shows. Normalised to the start of the day so the
-- date a member is shown is the date they are charged.
create or replace function public.draw_installments()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p record; slice int; drawn int := 0;
begin
  for p in
    select ip.*, r.voyage_id
    from public.installment_plans ip
    left join public.rsvps r on r.id = ip.rsvp_id
    where ip.status = 'active'
      and ip.next_charge_at is not null
      and ip.next_charge_at <= now()
    for update of ip
  loop
    slice := ceil((p.total_cents - p.down_payment_cents)::numeric / (p.installments - 1))::int;

    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
    values (p.profile_id, -slice, 'berth',
            'Installment ' || (p.paid_count + 1) || ' of ' || p.installments,
            p.voyage_id, p.rsvp_id);

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
$function$;
;
