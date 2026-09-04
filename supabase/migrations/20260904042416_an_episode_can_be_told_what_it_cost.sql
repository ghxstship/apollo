-- Reports has computed revenue per episode since it shipped and there has never
-- been a cost side: vessels carry no charter rate, venues carry no fee,
-- crew_assignments carry no pay, and no expense table exists. So "per-episode
-- P&L" has meant per-episode revenue with the L missing.
--
-- AND NO NUMBER IN THIS MIGRATION IS INVENTED, for the same reason none was in
-- the tax one. Of the five per-head cost lines in the operating playbook, one
-- came from the owner and four were an assistant's estimates. A P&L built on
-- estimates would look authoritative and be fiction, and it would be believed
-- precisely because it is rendered next to real revenue.
--
-- So this is the shape and not the content: somewhere to record what a night
-- actually cost, and defaults that stay null until somebody who knows fills
-- them in. An empty P&L that says it is empty is worth more than a populated
-- one that is wrong.

create table if not exists public.expense_kinds (
  slug text primary key,
  label text not null,
  position integer not null default 0
);

insert into public.expense_kinds (slug, label, position) values
  ('crew',     'Crew',            1),
  ('vessel',   'Vessel charter',  2),
  ('venue',    'Venue',           3),
  ('catering', 'Food and drink',  4),
  ('media',    'Media',           5),
  ('other',    'Other',           6)
on conflict (slug) do nothing;

create table if not exists public.episode_expenses (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  kind text not null references public.expense_kinds(slug),
  amount_cents integer not null check (amount_cents >= 0),
  note text,
  /* An estimate and a settled invoice are different facts and a P&L that mixes
     them silently is the reason nobody trusts one. */
  settled boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists episode_expenses_by_episode on public.episode_expenses (episode_id);

/* Defaults, so a night does not have to be costed from nothing every time.
   All nullable, all unset — a null rate means nobody has told the club what
   this costs, which is the truth today and reads differently from zero. */
alter table public.vessels add column if not exists day_rate_cents integer;
alter table public.venues  add column if not exists fee_cents integer;
alter table public.crew    add column if not exists day_rate_cents integer;

comment on column public.vessels.day_rate_cents is
  'What this hull costs for a day. Null means undetermined — not free.';
comment on column public.venues.fee_cents is
  'What this room costs for a night. Null means undetermined — not free.';
comment on column public.crew.day_rate_cents is
  'What this person is paid for a day. Null means undetermined — not free.';

alter table public.expense_kinds enable row level security;
alter table public.episode_expenses enable row level security;

drop policy if exists "kinds are readable" on public.expense_kinds;
create policy "kinds are readable" on public.expense_kinds
  for select to authenticated using (public.is_staff());
drop policy if exists "staff keep the kinds" on public.expense_kinds;
create policy "staff keep the kinds" on public.expense_kinds
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

/* Costs are staff-only in every direction. What a night cost the club is not a
   member's business and would read as a markup if it were. */
drop policy if exists "staff keep the expenses" on public.episode_expenses;
create policy "staff keep the expenses" on public.episode_expenses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.expense_kinds to authenticated;
grant select, insert, update, delete on public.episode_expenses to authenticated;;
