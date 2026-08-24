-- splitIntoDraws reads installment_plans by rsvp_id, returns early if a plan
-- exists, and otherwise inserts a credit and a plan — across three separate
-- round trips, with nothing unique on rsvp_id underneath. Two tabs confirming a
-- split pass at once produce two credits and two active plans. The member sits
-- on a large spurious credit for a month and is then drawn DOUBLE the agreed
-- monthly slice until both plans complete. It converges to the right total, so
-- nobody is robbed — but the statement and the monthly debit are both wrong for
-- months, and a member watching their account come out twice as fast as they
-- agreed has every reason to think they are being robbed.
--
-- The comment above the check says "a second confirm must not draw it twice",
-- which is exactly right and exactly what a read cannot enforce.
--
-- One active plan per pass, at the table. Historic cancelled plans stay — a
-- released pass cancels its plan rather than deleting it, and the record of
-- what was agreed is worth keeping.
create unique index if not exists installment_plans_one_active_per_pass
  on public.installment_plans (rsvp_id)
  where status = 'active';

-- The credit is the money half of the same act, and it had nothing stopping a
-- duplicate either.
alter table public.account_ledger
  drop constraint if exists account_ledger_split_credit_once;

create unique index if not exists account_ledger_one_split_credit_per_pass
  on public.account_ledger (rsvp_id)
  where kind = 'credit' and rsvp_id is not null and memo like 'Split into %';
;
