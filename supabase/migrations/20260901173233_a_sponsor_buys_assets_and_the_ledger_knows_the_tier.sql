-- operations.md §5, given a schema at last: four tiers, $2k–$10k monthly, with
-- named asset inventories. The retainer lives on the sponsor; a sailing
-- activates a sponsor through the join. Commercial terms are the Bridge's
-- reading alone — the public sees a credit line, nothing more, through
-- sponsor_credits() below.
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  tier text not null check (tier in
    ('presenting_partner','sandbar_hub','confessional_pod','shore_leave_partner')),
  monthly_cents integer not null check (monthly_cents >= 0),
  contact_email text,
  starts_on date,
  ends_on date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint a_retainer_ends_after_it_begins
    check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.voyage_sponsors (
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  placement text,
  created_at timestamptz not null default now(),
  primary key (voyage_id, sponsor_id)
);

alter table public.sponsors enable row level security;
alter table public.voyage_sponsors enable row level security;

create policy "the bridge keeps the sponsor book" on public.sponsors
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "the bridge places the activations" on public.voyage_sponsors
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- The public credit: name and tier, never the money. Definer on purpose —
-- the tables above are sealed and this is the one window through them.
create or replace function public.sponsor_credits(p_voyage uuid)
returns table (name text, tier text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.name, s.tier
  from public.voyage_sponsors vs
  join public.sponsors s on s.id = vs.sponsor_id
  where vs.voyage_id = p_voyage and s.active
  order by case s.tier
    when 'presenting_partner' then 1 when 'sandbar_hub' then 2
    when 'confessional_pod' then 3 else 4 end, s.name;
$$;

grant execute on function public.sponsor_credits(uuid) to anon, authenticated;;
