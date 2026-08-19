-- Drain the push and SMS queues alongside the email outbox.
select cron.schedule('send-push-drain', '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://mpyvwpunwrioakmtmcdo.supabase.co/functions/v1/send-push',
       headers := jsonb_build_object('Content-Type','application/json',
         'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weXZ3cHVud3Jpb2FrbXRtY2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDk5MjEsImV4cCI6MjEwMDQyNTkyMX0.91_S2wHsAz1j-5lrkf_k4iZx6EwF1CUQT1Nn4xY-Oxk'),
       body := '{}'::jsonb) $$);

select cron.schedule('send-sms-drain', '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://mpyvwpunwrioakmtmcdo.supabase.co/functions/v1/send-sms',
       headers := jsonb_build_object('Content-Type','application/json',
         'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1weXZ3cHVud3Jpb2FrbXRtY2RvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4NDk5MjEsImV4cCI6MjEwMDQyNTkyMX0.91_S2wHsAz1j-5lrkf_k4iZx6EwF1CUQT1Nn4xY-Oxk'),
       body := '{}'::jsonb) $$);

-- Installment draws: post the next scheduled slice to the house account.
create or replace function public.draw_installments()
returns int language plpgsql security definer set search_path = public as $$
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
          next_charge_at = case when paid_count + 1 >= installments - 1
                                then null else next_charge_at + interval '30 days' end,
          status = case when paid_count + 1 >= installments - 1 then 'complete' else 'active' end
      where id = p.id;
    insert into public.notifications (profile_id, kind, title, body)
    values (p.profile_id, 'word', 'An installment was drawn.',
            'Slice ' || (p.paid_count + 1) || ' of ' || p.installments || ' is on your account. No interest, as promised.');
    drawn := drawn + 1;
  end loop;
  return drawn;
end $$;
revoke execute on function public.draw_installments() from public, anon, authenticated;

select cron.schedule('installment-draws', '0 15 * * *', $$ select public.draw_installments() $$);
