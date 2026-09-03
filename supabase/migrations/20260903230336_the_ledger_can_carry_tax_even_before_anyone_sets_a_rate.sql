-- Zero tax handling exists in this codebase: no tax_cents, no rate, no
-- automatic_tax, nothing. Miami is live and Los Angeles is open, so that is a
-- two-state exposure and every untaxed sale is a liability settled later out of
-- margin.
--
-- WHAT THIS MIGRATION DOES NOT DO IS SET A RATE, and that is deliberate.
-- Florida taxes admissions to events. California generally does not — it taxes
-- tangible goods, and an admission is a service. So the two cities differ in
-- KIND and not merely in percentage, which means the obvious fix — turn on
-- automatic tax and let Stripe work it out — is wrong twice over:
--
--   the settlement checkout charges a house-account BALANCE, an aggregate of
--   passes, deposits, bar tabs and dues already incurred. Taxing that lump as
--   one line applies a single product code to things with different treatments,
--   and double-taxes anything already taxed at charge time; and
--
--   taxability and registration are determinations, not settings. Whether the
--   club owes admissions tax in a state, and whether it is registered to
--   collect there, is an accountant's answer and a filing — not a default a
--   migration should invent.
--
-- So this builds the mechanism and leaves the judgement to a person: somewhere
-- to record tax per ledger row, and somewhere to record what a city's treatment
-- is once someone qualified has said so. Both are empty and inert until set.

alter table public.account_ledger
  add column if not exists tax_cents integer not null default 0;

comment on column public.account_ledger.tax_cents is
  'Tax included in delta_cents on this row, if any. Zero means untaxed, not tax-free — see city_tax for whether a rate has been determined at all.';

create table if not exists public.city_tax (
  city_id uuid primary key references public.cities(id) on delete cascade,
  /* Null is the honest default and reads differently from zero: null means
     nobody has determined the treatment yet, zero means determined as untaxed. */
  admissions_rate_bp integer,
  goods_rate_bp integer,
  /* Collecting tax you are not registered to collect is its own problem. */
  registered boolean not null default false,
  note text,
  determined_by text,
  determined_on date,
  updated_at timestamptz not null default now()
);

comment on table public.city_tax is
  'What a city''s tax treatment IS, once somebody qualified has determined it. Rates in basis points. A null rate means undetermined; zero means determined to be untaxed. Nothing here is set by default and nothing should be guessed.';

alter table public.city_tax enable row level security;

drop policy if exists "staff keep the tax table" on public.city_tax;
create policy "staff keep the tax table" on public.city_tax
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.city_tax to authenticated;

-- A row per open city so the gap is visible rather than absent: an operator
-- opening this table sees two cities awaiting a determination, not an empty
-- table that looks like a feature nobody turned on.
insert into public.city_tax (city_id, note)
select id, 'Awaiting a determination — no rate has been set and none is assumed.'
from public.cities where status = 'open'
on conflict (city_id) do nothing;;
