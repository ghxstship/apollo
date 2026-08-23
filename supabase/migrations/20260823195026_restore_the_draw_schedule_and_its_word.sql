-- The previous migration rewrote draw_installments from a description of it
-- rather than from its source, and quietly changed three things that were
-- right: the next charge is scheduled from the LAST one (next_charge_at +
-- 30 days), not from whenever the cron happened to run — otherwise a late run
-- walks the whole schedule forward; the terminal status is 'complete', which is
-- what the Bridge reads; and each draw tells the member, which is the promise
-- the split was sold on ("No interest, as promised").
--
-- Restored, keeping only what this pass was actually fixing: the draw carries
-- its sailing, so the release credit and the already-charged check can see it.
create or replace function public.draw_installments()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
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
                                then null else next_charge_at + interval '30 days' end,
          status = case when paid_count + 1 >= installments then 'complete' else 'active' end
      where id = p.id;

    insert into public.notifications (profile_id, kind, title, body)
    values (p.profile_id, 'word', 'An installment was drawn.',
            'Slice ' || (p.paid_count + 1) || ' of ' || p.installments || ' is on your account. No interest, as promised.');

    drawn := drawn + 1;
  end loop;
  return drawn;
end;
$$;

revoke execute on function public.draw_installments() from public, anon, authenticated;;
