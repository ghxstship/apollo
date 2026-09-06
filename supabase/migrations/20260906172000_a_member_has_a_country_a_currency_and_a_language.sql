-- The club sells a Global standing from the start, and nothing in the schema
-- knew that a member could be anywhere.
--
-- Not one column in 137 tables mentioned a country, a currency, a language or
-- a tax identifier. Money is an integer of cents with the dollar sign written
-- into five formatters; copy is English literals; consent defaults to granted,
-- which is lawful in the United States and is not lawful in the EEA or the UK.
-- Every one of those is cheap to add now and expensive to add later: the ledger
-- already holds 3,299 rows, and a currency column added after the first
-- non-dollar charge is a backfill against money somebody has already paid.
--
-- So this is the expand half, on its own, ahead of anything that reads it.
-- Every column is nullable or defaulted, nothing changes behaviour, and no
-- existing row moves. What it buys is that the surfaces which follow -- tax
-- identifiers, opt-in marketing, locale negotiation, a second currency -- are
-- configuration rather than a migration against live money.
--
-- One deliberate omission: jurisdiction is NOT defaulted to 'US'. An assumed
-- jurisdiction is exactly the shortcut that produces a regression, because
-- every row would then assert a fact nobody established, and the assertion is
-- indistinguishable from one somebody made. Null means "not yet known", the
-- readers treat it as the stricter case, and the club asks.

-- ── Where a member is, what they read, what they pay in ─────────────────────

alter table public.profiles
  add column if not exists jurisdiction  text,
  add column if not exists locale        text,
  add column if not exists tax_id        text,
  add column if not exists tax_id_kind   text,
  add column if not exists tax_id_country text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'a_jurisdiction_is_two_letters') then
    alter table public.profiles add constraint a_jurisdiction_is_two_letters
      check (jurisdiction is null or jurisdiction ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'a_tax_id_country_is_two_letters') then
    alter table public.profiles add constraint a_tax_id_country_is_two_letters
      check (tax_id_country is null or tax_id_country ~ '^[A-Z]{2}$');
  end if;
  /* BCP-47, loosely: a language subtag and optionally more, joined by hyphens.
     Deliberately not an enumeration of the locales the club ships -- that list
     will change more often than this constraint should. */
  if not exists (select 1 from pg_constraint where conname = 'a_locale_is_bcp47_shaped') then
    alter table public.profiles add constraint a_locale_is_bcp47_shaped
      check (locale is null or locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'a_tax_id_says_what_kind_it_is') then
    alter table public.profiles add constraint a_tax_id_says_what_kind_it_is
      check ((tax_id is null) = (tax_id_kind is null));
  end if;
end $$;

comment on column public.profiles.jurisdiction is
  'ISO 3166-1 alpha-2, where this member is for the purposes of consent, tax and consumer law. NULL means not yet established -- which readers must treat as the stricter case, not as the United States. Set from the billing address the processor collects, or asked for directly.';
comment on column public.profiles.locale is
  'BCP-47, the language and region this member reads the club in. NULL means negotiate it from the request each time, which is the right answer until they have chosen.';
comment on column public.profiles.tax_id is
  'A VAT, GST, ABN, CNPJ or equivalent, for a member who is buying through a business. Held so an invoice can carry it and so a reverse charge can be applied where one is due; never used to identify a person.';
comment on column public.profiles.tax_id_kind is
  'What kind of identifier tax_id is -- eu_vat, gb_vat, au_abn, br_cnpj and the rest, in the processor''s own vocabulary so the two do not need translating.';

-- ── Money says what money it is ─────────────────────────────────────────────

alter table public.account_ledger
  add column if not exists currency text not null default 'usd';
alter table public.membership_plans
  add column if not exists currency text not null default 'usd';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'a_ledger_line_names_its_currency') then
    alter table public.account_ledger add constraint a_ledger_line_names_its_currency
      check (currency ~ '^[a-z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'a_plan_names_its_currency') then
    alter table public.membership_plans add constraint a_plan_names_its_currency
      check (currency ~ '^[a-z]{3}$');
  end if;
end $$;

comment on column public.account_ledger.currency is
  'ISO 4217, lower case to match the processor''s own spelling. Every existing row is ''usd'' because every existing charge was in dollars; the column exists so that stops being an assumption the code makes and becomes a fact the row carries. Note that cents are not universal -- a zero-decimal currency stores its own minor unit here, and any formatter must read this column rather than divide by a hundred.';
comment on column public.membership_plans.currency is
  'ISO 4217 for this standing''s dues. A second currency is a second price at the processor and a second row here, not a conversion at read time -- the club never invents an exchange rate.';

-- ── Where consent must be asked rather than assumed ─────────────────────────

create or replace function public.marketing_needs_opt_in(p_jurisdiction text)
returns boolean
language sql
immutable
set search_path to 'public'
as $fn$
  /* The EEA, the UK and Switzerland require prior consent for unsolicited
     commercial mail, and Canada requires it under CASL. The United States
     allows opt-out under CAN-SPAM, and is the exception rather than the rule --
     so this is written as "everywhere except", not as a list of the strict
     places, because a country missing from a list of the strict places fails
     open and a country missing from this one fails closed.

     A member whose jurisdiction is not yet known is treated as needing to be
     asked. The cost of asking somebody in Ohio a question is a question; the
     cost of not asking somebody in Ireland is a breach. */
  select coalesce(p_jurisdiction, '') <> 'US'
$fn$;

comment on function public.marketing_needs_opt_in(text) is
  'Whether marketing to a member in this jurisdiction requires a recorded prior consent rather than an opportunity to opt out. Written as everywhere-except-the-US on purpose: an unlisted country then fails closed rather than open. NULL -- not yet established -- answers true, which is the stricter case and the safe direction to be wrong in.';

notify pgrst, 'reload schema';
