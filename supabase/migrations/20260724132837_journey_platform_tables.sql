-- ===== Staff helper =====
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select p.is_staff from public.profiles p where p.id = auth.uid()), false) $$;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_staff() to authenticated;

-- ===== Profiles: lifecycle + prefs + waiver =====
alter table public.profiles
  add column status text not null default 'active' check (status in ('active','paused','departed')),
  add column notification_prefs jsonb not null default '{"weather":true,"berths":true,"fathoms":true}',
  add column waiver_signed_at timestamptz;

-- ===== Vetting: the member roll (approved emails) =====
create table public.member_roll (
  email text primary key,
  tier public.membership_tier not null default 'regional',
  home_harbor uuid references public.harbors(id),
  source text not null default 'application', -- application | invite | founder
  invite_code text,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.member_roll enable row level security;
create policy "staff manage roll" on public.member_roll
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Only approved emails may become auth users (defense in depth behind shouldCreateUser)
create or replace function public.enforce_member_roll()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.member_roll where lower(email) = lower(new.email)) then
    raise exception 'not on the member roll';
  end if;
  return new;
end $$;
create trigger before_auth_user_created
before insert on auth.users
for each row execute function public.enforce_member_roll();

-- Gangway pre-check: may this email board? (existing member or on the roll)
create or replace function public.email_may_board(p_email text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.member_roll where lower(email) = lower(p_email))
      or exists (select 1 from public.profiles where lower(email) = lower(p_email));
$$;
grant execute on function public.email_may_board(text) to anon, authenticated;

-- ===== Invites (a member's code = one salon as their guest) =====
create table public.invites (
  code text primary key,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  max_uses int not null default 3,
  uses int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
create policy "own invites" on public.invites
  for select to authenticated using (inviter_id = auth.uid() or public.is_staff());
create policy "mint own invite" on public.invites
  for insert to authenticated with check (inviter_id = auth.uid());

create or replace function public.validate_invite(p_code text)
returns text language sql stable security definer set search_path = public
as $$
  select p.full_name from public.invites i join public.profiles p on p.id = i.inviter_id
  where i.code = upper(p_code) and i.uses < i.max_uses limit 1;
$$;
grant execute on function public.validate_invite(text) to anon, authenticated;

-- ===== Applications: richer funnel =====
alter type public.application_status add value if not exists 'declined';
alter table public.applications
  add column interests text[] not null default '{}',
  add column tier_requested public.membership_tier not null default 'regional',
  add column invite_code text,
  add column waiver_swim boolean not null default false,
  add column waiver_conduct boolean not null default false,
  add column reviewed_by uuid references public.profiles(id),
  add column decided_at timestamptz;
create policy "staff read applications" on public.applications
  for select to authenticated using (public.is_staff());
create policy "staff update applications" on public.applications
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- Applicants can watch their own tracker by email (via RPC, no table read)
create or replace function public.application_status_for(p_email text)
returns public.application_status language sql stable security definer set search_path = public
as $$
  select status from public.applications where lower(email) = lower(p_email)
  order by created_at desc limit 1;
$$;
grant execute on function public.application_status_for(text) to anon, authenticated;

-- ===== Member account (house ledger, cents; negative = charge) =====
create table public.account_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta_cents int not null,
  kind text not null check (kind in ('berth','deposit','addon','galley','chandlery','dues','credit','refund','payment')),
  memo text,
  voyage_id uuid references public.voyages(id) on delete set null,
  rsvp_id uuid references public.rsvps(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.account_ledger (profile_id);
alter table public.account_ledger enable row level security;
create policy "own or staff ledger" on public.account_ledger
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy "member posts own charges" on public.account_ledger
  for insert to authenticated
  with check (profile_id = auth.uid() and delta_cents <= 0 and kind in ('berth','deposit','addon','galley','chandlery'));
create policy "staff posts anything" on public.account_ledger
  for insert to authenticated with check (public.is_staff());
create view public.account_balance with (security_invoker = on) as
  select profile_id, coalesce(sum(delta_cents),0)::int as balance_cents
  from public.account_ledger group by profile_id;

-- ===== Voyages: ops fields =====
alter table public.voyages
  add column deposit_required boolean not null default false,
  add column muster text,
  add column conditions jsonb,
  add column fathoms_multiplier numeric not null default 1;
create policy "staff write voyages" on public.voyages
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ===== RSVPs: check-in, boarding code, manifest consent =====
alter table public.rsvps
  add column checked_in_at timestamptz,
  add column checked_in_by uuid references public.profiles(id),
  add column boarding_code text,
  add column show_on_manifest boolean not null default true;
create policy "staff manage rsvps" on public.rsvps
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ===== Add-ons =====
create table public.addons (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  price_cents int not null,
  active boolean not null default true
);
alter table public.addons enable row level security;
create policy "addons are public" on public.addons for select using (true);
create policy "staff write addons" on public.addons
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create table public.rsvp_addons (
  rsvp_id uuid not null references public.rsvps(id) on delete cascade,
  addon_id uuid not null references public.addons(id) on delete cascade,
  qty int not null default 1 check (qty between 1 and 6),
  primary key (rsvp_id, addon_id)
);
alter table public.rsvp_addons enable row level security;
create policy "own rsvp addons" on public.rsvp_addons
  for all to authenticated
  using (exists (select 1 from public.rsvps r where r.id = rsvp_id and (r.profile_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.rsvps r where r.id = rsvp_id and (r.profile_id = auth.uid() or public.is_staff())));

-- ===== Rewards & redemptions =====
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  detail text,
  cost_fm int not null,
  active boolean not null default true,
  position int not null default 0
);
alter table public.rewards enable row level security;
create policy "members read rewards" on public.rewards for select to authenticated using (true);
create policy "staff write rewards" on public.rewards
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.rewards(id),
  created_at timestamptz not null default now()
);
alter table public.reward_redemptions enable row level security;
create policy "own or staff redemptions" on public.reward_redemptions
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());

-- ===== Wardroom moderation =====
create table public.wardroom_flags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.wardroom_posts(id) on delete cascade,
  flagger_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open','removed','left_up')),
  resolved_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.wardroom_flags enable row level security;
create policy "flag a post" on public.wardroom_flags
  for insert to authenticated with check (flagger_id = auth.uid());
create policy "own or staff flags" on public.wardroom_flags
  for select to authenticated using (flagger_id = auth.uid() or public.is_staff());
create policy "staff resolve flags" on public.wardroom_flags
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "staff moderate posts" on public.wardroom_posts
  for delete to authenticated using (public.is_staff());
create policy "staff moderate comments" on public.wardroom_comments
  for delete to authenticated using (public.is_staff());

-- ===== Email outbox =====
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  template text not null,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','sent','skipped','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.email_outbox enable row level security;
create policy "staff read outbox" on public.email_outbox
  for select to authenticated using (public.is_staff());

-- ===== Galley (POS + self-order) =====
create table public.galley_items (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('bar','galley','merch')),
  name text not null,
  price_cents int not null,
  active boolean not null default true
);
alter table public.galley_items enable row level security;
create policy "members read galley" on public.galley_items for select to authenticated using (true);
create policy "staff write galley" on public.galley_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create table public.galley_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  voyage_id uuid references public.voyages(id) on delete set null,
  source text not null default 'self' check (source in ('self','pos')),
  status text not null default 'placed' check (status in ('placed','ready','delivered','cancelled')),
  total_cents int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.galley_orders enable row level security;
create policy "own or staff orders read" on public.galley_orders
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy "place own order" on public.galley_orders
  for insert to authenticated with check (profile_id = auth.uid() or public.is_staff());
create policy "staff update orders" on public.galley_orders
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create table public.galley_order_items (
  order_id uuid not null references public.galley_orders(id) on delete cascade,
  item_id uuid not null references public.galley_items(id),
  qty int not null default 1 check (qty between 1 and 12),
  price_cents int not null,
  primary key (order_id, item_id)
);
alter table public.galley_order_items enable row level security;
create policy "own or staff order items" on public.galley_order_items
  for all to authenticated
  using (exists (select 1 from public.galley_orders o where o.id = order_id and (o.profile_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.galley_orders o where o.id = order_id and (o.profile_id = auth.uid() or public.is_staff())));

-- ===== The Chandlery (shop) =====
create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null check (category in ('deck','galley','wardrobe')),
  price_cents int not null,
  sizes text[] not null default '{}',
  badge text,
  active boolean not null default true
);
alter table public.products enable row level security;
create policy "members read products" on public.products for select to authenticated using (true);
create policy "staff write products" on public.products
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  total_cents int not null default 0,
  discount_cents int not null default 0,
  status text not null default 'placed' check (status in ('placed','fulfilled','refund_requested','refunded')),
  created_at timestamptz not null default now()
);
alter table public.shop_orders enable row level security;
create policy "own or staff shop orders" on public.shop_orders
  for select to authenticated using (profile_id = auth.uid() or public.is_staff());
create policy "place shop order" on public.shop_orders
  for insert to authenticated with check (profile_id = auth.uid());
create policy "member requests refund" on public.shop_orders
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "staff update shop orders" on public.shop_orders
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create table public.shop_order_items (
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty int not null default 1 check (qty between 1 and 12),
  size text,
  price_cents int not null,
  primary key (order_id, product_id)
);
alter table public.shop_order_items enable row level security;
create policy "own or staff shop items" on public.shop_order_items
  for all to authenticated
  using (exists (select 1 from public.shop_orders o where o.id = order_id and (o.profile_id = auth.uid() or public.is_staff())))
  with check (exists (select 1 from public.shop_orders o where o.id = order_id and (o.profile_id = auth.uid() or public.is_staff())));

-- ===== Crew ATS =====
create table public.crew_roles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  port text not null,
  meta text,
  blurb text,
  open boolean not null default true,
  position int not null default 0
);
alter table public.crew_roles enable row level security;
create policy "roles are public" on public.crew_roles for select using (true);
create policy "staff write roles" on public.crew_roles
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
create table public.crew_candidates (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.crew_roles(id) on delete cascade,
  full_name text not null,
  email text not null,
  note text,
  stage text not null default 'applied' check (stage in ('applied','interview','sea_trial','offer','passed')),
  created_at timestamptz not null default now()
);
alter table public.crew_candidates enable row level security;
create policy "anyone applies to crew" on public.crew_candidates
  for insert to anon, authenticated
  with check (char_length(full_name) between 1 and 120 and position('@' in email) > 1);
create policy "staff read candidates" on public.crew_candidates
  for select to authenticated using (public.is_staff());
create policy "staff move candidates" on public.crew_candidates
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ===== Realtime =====
alter publication supabase_realtime add table public.wardroom_posts, public.wardroom_comments, public.wardroom_hails, public.notifications;
