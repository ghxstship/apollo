-- ===== Tier 0: recurring dues, installments, billing self-service =====

alter table public.profiles add column stripe_customer_id text unique;
alter table public.membership_plans
  add column stripe_price_id text,
  add column stripe_price_id_annual text,
  add column annual_price_cents int;
-- Annual = ten months (two free), per the pricing architecture.
update public.membership_plans set annual_price_cents = price_cents * 10 where price_cents > 0;

create type public.subscription_status as enum
  ('incomplete','trialing','active','past_due','paused','canceled');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.membership_plans(id),
  stripe_subscription_id text unique,
  status public.subscription_status not null default 'incomplete',
  interval text not null default 'month' check (interval in ('month','year')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (profile_id);
alter table public.subscriptions enable row level security;
create policy "own or staff subscriptions" on public.subscriptions
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy "staff write subscriptions" on public.subscriptions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Invoices mirrored from Stripe for the member's billing history.
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  stripe_invoice_id text unique,
  number text,
  amount_cents int not null default 0,
  status text not null default 'open',
  hosted_url text,
  pdf_url text,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invoices (profile_id, created_at desc);
alter table public.invoices enable row level security;
create policy "own or staff invoices" on public.invoices
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());

-- Cached card details so the billing page never round-trips to Stripe.
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  stripe_payment_method_id text unique,
  brand text,
  last4 text,
  exp_month int,
  exp_year int,
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.payment_methods enable row level security;
create policy "own or staff payment methods" on public.payment_methods
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());

-- Pass-level installment plans (TIXR pattern: down payment + scheduled draws).
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rsvp_id uuid references public.rsvps(id) on delete set null,
  total_cents int not null,
  down_payment_cents int not null default 0,
  installments int not null check (installments between 2 and 6),
  paid_count int not null default 0,
  next_charge_at timestamptz,
  status text not null default 'active' check (status in ('active','complete','defaulted','cancelled')),
  created_at timestamptz not null default now()
);
create index on public.installment_plans (profile_id);
alter table public.installment_plans enable row level security;
create policy "own or staff installments" on public.installment_plans
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy "staff write installments" on public.installment_plans
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Dues charged to the house ledger when an invoice is paid; membership
-- state follows the subscription so the booking guard stays honest.
create or replace function public.handle_subscription_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('active','trialing') then
    update public.profiles set status = 'active', plan_id = coalesce(new.plan_id, plan_id)
    where id = new.profile_id and status <> 'departed';
  elsif new.status = 'paused' then
    update public.profiles set status = 'paused' where id = new.profile_id;
  elsif new.status in ('canceled','past_due') and old.status in ('active','trialing') then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.profile_id, 'word',
      case when new.status = 'past_due' then 'Dues did not clear.' else 'Membership closed.' end,
      case when new.status = 'past_due'
           then 'The card was declined. Settle in the portal and nothing else changes.'
           else 'Your dues have lapsed. A word to Shoreside puts you back on the water.' end);
  end if;
  return new;
end $$;
create trigger on_subscription_status
after insert or update of status on public.subscriptions
for each row execute function public.handle_subscription_status();
revoke execute on function public.handle_subscription_status() from public, anon, authenticated;
