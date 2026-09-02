/* The monthly pass credit Model C carries, built as an entitlement rather than
   a ledger balance — and the distinction is the whole design.

   A credit posted to account_ledger would be indistinguishable from a refund or
   a payment, would sit in the member's balance forever, and would therefore
   ACCUMULATE. That is not what dues carry. Dues carry an allowance for the
   month, and an allowance that never expires is not an allowance, it is a
   liability that grows every time somebody does not come.

   So the credit lives here: one row per member per month, granted on the first,
   drawn down as passes are taken, and simply not carried forward. Unspent
   credit is the club's margin, which is the honest half of why a credit is
   better than an event count.

   NOTHING DRAWS ON THIS YET. The booking path charges the account exactly as it
   did, so this migration changes no money today. Wiring the draw-down into the
   pass charge touches handle_pass_aboard, which is the money path, and it is
   going in behind the full gate battery rather than beside four other agents. */

create table if not exists public.pass_credits (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  /* The first of the month the credit belongs to. A date, not a range: the
     period is always one calendar month and storing both ends invites them to
     disagree. */
  period        date not null,
  plan_id       uuid references public.membership_plans(id) on delete set null,
  granted_cents integer not null check (granted_cents >= 0),
  spent_cents   integer not null default 0 check (spent_cents >= 0),
  created_at    timestamptz not null default now(),
  /* One grant per member per month. This is the idempotency: the granting
     function can run every day of the month and the second run is a no-op. */
  unique (profile_id, period),
  /* A member cannot spend more than they were given. The booking path will
     take the lesser of the pass price and what is left, so this should never
     fire — which is exactly when a constraint is worth having. */
  check (spent_cents <= granted_cents)
);

comment on table public.pass_credits is
  'The monthly pass allowance a plan carries. Granted on the first, drawn down by bookings, never carried forward.';

create index if not exists pass_credits_by_member on public.pass_credits (profile_id, period desc);

alter table public.pass_credits enable row level security;

/* A member reads their own; staff read all. Nobody writes from a client —
   grants come from the scheduled function and draw-downs from the booking
   path, both definer. */
create policy "a member reads their own credit" on public.pass_credits
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());

/* What is left to spend this month, for the member asking. */
create or replace function public.pass_credit_left(p_profile_id uuid default null)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select greatest(0, c.granted_cents - c.spent_cents)
       from public.pass_credits c
      where c.profile_id = coalesce(p_profile_id, auth.uid())
        and c.period = date_trunc('month', (now() at time zone 'America/New_York'))::date),
    0);
$function$;

revoke all on function public.pass_credit_left(uuid) from public, anon;
grant execute on function public.pass_credit_left(uuid) to authenticated;

/* Grant this month's credit to every active member on a plan that carries one.
   Idempotent by the unique index, so the schedule can be as loud as it likes.

   Paused members do not accrue: a pause stops the dues, so it stops the
   allowance those dues buy. is_active() is the club's own answer to that
   question and is used rather than re-deriving it here. */
create or replace function public.grant_monthly_pass_credit()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare granted integer;
begin
  insert into public.pass_credits (profile_id, period, plan_id, granted_cents)
  select p.id,
         date_trunc('month', (now() at time zone 'America/New_York'))::date,
         p.plan_id,
         m.monthly_credit_cents
  from public.profiles p
  join public.membership_plans m on m.id = p.plan_id
  where p.status = 'active'
    and m.active
    and m.monthly_credit_cents > 0
  on conflict (profile_id, period) do nothing;

  get diagnostics granted = row_count;
  return granted;
end $function$;

revoke all on function public.grant_monthly_pass_credit() from public, anon, authenticated;

/* Half past midnight on the first, on the club's clock. Late enough that a
   subscription renewing at midnight has settled, early enough that the first
   member awake already has their month. */
select cron.schedule(
  'grant-monthly-pass-credit',
  '30 5 1 * *',
  $$select public.grant_monthly_pass_credit()$$
);

/* Give this month's credit to whoever is already owed it, so the feature does
   not start life a month behind. */
do $$
declare n int;
begin
  n := public.grant_monthly_pass_credit();
  raise notice 'credits granted for the current month: %', n;
end $$;;
