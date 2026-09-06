-- A house credit has a ceiling (decided 2026-09-06).
--
-- a_refund_against_a_payment_returns_money left this open in writing. A refund
-- that names a Stripe payment is capped by the payment; a refund with a NULL
-- stripe_ref is the house credit — money the club gives back with nothing
-- behind it — and that migration called it "uncapped by design, because there
-- is no payment to cap it against", closing with the note that if the
-- capability should ever be bounded, "the bound is a policy question about how
-- much an operator may credit at once". This is that policy, written down.
--
-- One operator on the Bridge types a number into Post refund and it becomes
-- real money on a member's account. postLedgerEntry warns about a REPEAT and
-- says nothing about a SIZE, so the only thing standing between a mistyped
-- 165.00 and a mistyped 16500.00 was the person typing it. Twenty-one house
-- credits stand on the books today and not one of them is above the ceiling
-- set here, so this closes a door before anyone walks through it.
--
-- THE CEILING is one setting, so it turns without a deploy, and it sits beside
-- match_guarantee_cents rather than in code. 16500 is the price of one pass:
-- the commonest price in the catalogue today, across sixty-seven priced
-- episodes. A credit at or under one pass is one operator's to give, which is
-- the everyday case — a night that did not sail, a pass released a day late.
-- Above one pass, a second operator puts their name on the row.
--
-- THE SECOND OPERATOR, and why it looks like this. The club had no two-person
-- decision to copy. Every decision in the schema is one person's: applications
-- carry reviewed_by, member_roll approved_by, charter_requests decided_by,
-- episode_media uploaded_by, and each is a single id set by whoever acted.
-- The nearest relative is counter_signatures, and it is a different animal —
-- two PARTIES to one contract, the member and the club, not two hands on the
-- club's side. There was nothing to follow, so this is the smallest honest
-- version the decision allows: a second staff id recorded on the row itself,
-- and the credit refused until it is there.
--
-- It borrows one thing from counter_signatures deliberately: the second name
-- is a matter of record. seconded_by joins delta_cents, kind, stripe_ref and
-- profile_id in a_posted_line_does_not_move, so a credit cannot be posted with
-- a colleague's name and then quietly stripped of it.
--
-- What it does NOT do is stage the credit and wait. A queue of pending credits
-- is a second lifecycle, a second screen and a second set of refusals, and the
-- club does not have one of those to lean on either. The operator names their
-- second in the dialog and posts once, which is the act as it actually happens
-- on the Bridge — two people at one screen, deciding together.

-- ── 1 · The ceiling ─────────────────────────────────────────────────────────
alter table public.club_settings disable trigger zz_record_the_change;
insert into public.club_settings (key, value_int, note) values
  ('house_credit_max_cents', 16500,
   'The most one operator may put on a member account in a single house credit — a refund with no Stripe payment behind it. Defaulted to the price of one pass. Above it the row carries a second operator')
on conflict (key) do nothing;
alter table public.club_settings enable trigger zz_record_the_change;

-- ── 2 · The second name ─────────────────────────────────────────────────────
alter table public.account_ledger
  add column if not exists seconded_by uuid references public.profiles(id) on delete set null;

comment on column public.account_ledger.seconded_by is
  'The second operator on a house credit above house_credit_max_cents. Null on every other row: a credit inside the ceiling is one person''s to give. Frozen once posted, like the money columns beside it.';

-- A second name means one thing or it means nothing. It belongs to a house
-- credit and to no other row, and it is never the hand that posted the credit —
-- a person cannot be their own second.
alter table public.account_ledger
  drop constraint if exists a_second_name_belongs_to_a_house_credit;
alter table public.account_ledger
  add constraint a_second_name_belongs_to_a_house_credit
  check (seconded_by is null or (kind = 'refund' and stripe_ref is null));

alter table public.account_ledger
  drop constraint if exists a_house_credit_is_not_seconded_by_the_hand_that_posted_it;
alter table public.account_ledger
  add constraint a_house_credit_is_not_seconded_by_the_hand_that_posted_it
  check (seconded_by is null or created_by is null or seconded_by <> created_by);

-- ── 3 · The refusal ─────────────────────────────────────────────────────────
-- A trigger and not a check constraint, for two reasons: the ceiling is a
-- setting and a check cannot read one, and a check constraint's refusal is the
-- schema talking to itself — voice() flattens 23514 to "check the numbers and
-- try again", which tells an operator nothing about what is actually needed.
-- This raises a sentence, and voice() hands sentences straight through.
create or replace function public.a_house_credit_over_the_ceiling_waits_for_a_second_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_cap integer;
  v_second_is_an_operator boolean;
begin
  -- Only the house credit. A refund against a Stripe payment is already capped
  -- by the payment it reverses, and every other kind is a charge or a receipt.
  if new.kind <> 'refund' or new.stripe_ref is not null then return new; end if;

  if new.seconded_by is not null then
    select p.is_staff into v_second_is_an_operator
      from public.profiles p where p.id = new.seconded_by;
    if not coalesce(v_second_is_an_operator, false) then
      raise exception 'a house credit is seconded by an operator, not by a member';
    end if;
  end if;

  v_cap := public.club_setting('house_credit_max_cents');
  -- No ceiling set is not a licence: it is a setting somebody deleted, and the
  -- honest answer is to stop rather than to wave the money through.
  if v_cap is null then
    raise exception 'the house credit ceiling is not set — the Bridge sets it before a credit is posted';
  end if;

  if abs(new.delta_cents) <= v_cap or new.seconded_by is not null then return new; end if;

  raise exception 'a house credit above $% needs a second operator to put their name on it',
    to_char(v_cap / 100.0, 'FM999,999,990.00');
end $fn$;

revoke execute on function public.a_house_credit_over_the_ceiling_waits_for_a_second_name()
  from public, anon, authenticated;

drop trigger if exists a_house_credit_over_the_ceiling_waits_for_a_second_name on public.account_ledger;
create trigger a_house_credit_over_the_ceiling_waits_for_a_second_name
  before insert on public.account_ledger
  for each row execute function public.a_house_credit_over_the_ceiling_waits_for_a_second_name();

comment on function public.a_house_credit_over_the_ceiling_waits_for_a_second_name() is
  'A house credit — kind refund with no stripe_ref — above club_setting(house_credit_max_cents) is refused until a second operator is named on the row. Below it, one operator decides, as before.';

-- ── 4 · The second name does not come off again ─────────────────────────────
-- a_posted_line_does_not_move froze the money-bearing facts on 2026-09-06 and
-- listed the four that existed then. seconded_by is a fifth: a credit posted in
-- a colleague's name that can later be stripped of it is not a record of
-- anything. memo stays editable, for the same reason it always has.
create or replace function public.a_posted_line_does_not_move()
returns trigger
language plpgsql
as $fn$
begin
  if new.delta_cents is distinct from old.delta_cents
     or new.kind is distinct from old.kind
     or new.stripe_ref is distinct from old.stripe_ref
     or new.profile_id is distinct from old.profile_id
     or new.seconded_by is distinct from old.seconded_by then
    raise exception 'a posted line does not move: correct it with another line';
  end if;
  return new;
end $fn$;
