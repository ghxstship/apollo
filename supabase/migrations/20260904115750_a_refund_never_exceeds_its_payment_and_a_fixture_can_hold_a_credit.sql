-- Two things the money e2e section needs, from the 2026-09-04 tests pass.
--
-- 1. Nothing in the database bounded a refund by the payment it reverses;
--    refundToCard caps it in the application and a hand-typed refund on the
--    Bridge has no Stripe object at all. Where a refund names a payment, the
--    book refuses to return more than was paid. A refund with no stripe_ref is
--    house credit posted by a person and stays as it was.
create or replace function public.a_refund_never_exceeds_its_payment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare paid int; back int;
begin
  if new.kind <> 'refund' or new.stripe_ref is null then return new; end if;
  select coalesce(sum(delta_cents), 0) into paid from public.account_ledger
   where stripe_ref = new.stripe_ref and kind = 'payment';
  select coalesce(sum(abs(delta_cents)), 0) into back from public.account_ledger
   where stripe_ref = new.stripe_ref and kind in ('refund', 'dispute') and delta_cents < 0;
  if back + abs(new.delta_cents) > paid then
    raise exception 'a refund cannot exceed its payment: % paid, % already returned', paid, back;
  end if;
  return new;
end $function$;

revoke all on function public.a_refund_never_exceeds_its_payment() from public, anon, authenticated;

drop trigger if exists a_refund_never_exceeds_its_payment on public.account_ledger;
create trigger a_refund_never_exceeds_its_payment
  before insert on public.account_ledger
  for each row execute function public.a_refund_never_exceeds_its_payment();

-- 2. The suite has to be able to give a fixture persona an allowance to prove
--    the draw-down and the release arithmetic. Staff only, fixtures only.
create or replace function public.grant_pass_credit_by_hand(p_profile uuid, p_cents integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if not exists (select 1 from public.profiles where id = p_profile and email like 'e2e-%@fixtures.invalid') then
    raise exception 'fixture personas only';
  end if;
  insert into public.pass_credits (profile_id, period, granted_cents)
  values (p_profile, date_trunc('month', (now() at time zone 'America/New_York'))::date, p_cents)
  on conflict (profile_id, period) do update set granted_cents = excluded.granted_cents, spent_cents = 0;
end $function$;

revoke all on function public.grant_pass_credit_by_hand(uuid, integer) from public, anon;
grant execute on function public.grant_pass_credit_by_hand(uuid, integer) to authenticated;

-- 3. SMS drafts have carried the anchor in upper case since 20260828132337.
update public.sms_templates set draft_body = replace(draft_body, '[UN]:', '[un]:') where draft_body like '[UN]:%';;
