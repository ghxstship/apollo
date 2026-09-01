-- Single source of truth for the numbers the functions and the copy kept
-- repeating: a settings table read through one function, a segments table for
-- head weights, a tier ladder, the club's clock, the knots reason list, and
-- the sponsor rate card from operations.md §5.

create table public.club_settings (
  key text primary key check (key ~ '^[a-z_]{3,48}$'),
  value_int integer not null,
  note text
);
alter table public.club_settings enable row level security;
create policy "the settings are public reading" on public.club_settings
  for select to anon, authenticated using (true);
create policy "the bridge turns the dials" on public.club_settings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant insert, update, delete on public.club_settings to authenticated;

insert into public.club_settings (key, value_int, note) values
  ('hull_ceiling_heads',       40,    'USCG number for a certified passenger pontoon; the composition ceiling'),
  ('match_guarantee_cents',    15000, 'Credit when a Radar sailing yields no shared anchors'),
  ('pause_days_a_year',        90,    'Membership pause budget across a rolling year'),
  ('member_number_hold_days',  90,    'A released member number is held this long before reissue'),
  ('seat_hold_minutes',        15,    'A raced table seat is held this long'),
  ('cabin_option_hours',       72,    'A cabin held on option, no charge'),
  ('waitlist_claim_hours',     6,     'An offered seat is the member''s for this long'),
  ('release_credit_hours',     48,    'A pass released this far out is credited in full'),
  ('addon_cutoff_hour',        18,    'Add-ons close at this hour the evening before, harbour clock'),
  ('knots_pass_award',         25,    'Knots on a confirmed pass'),
  ('knots_per_nm',             10,    'Knots per nautical mile on completion'),
  ('knots_port_day',           40,    'Knots for a day in port on completion'),
  ('referral_knots',           250,   'Knots to the inviter when their code comes aboard');

create or replace function public.club_setting(p_key text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$ select value_int from public.club_settings where key = p_key $$;
grant execute on function public.club_setting(text) to anon, authenticated;

-- Segments and their head weights: a couple is one unit and two heads.
create table public.segments (
  slug text primary key,
  label text not null,
  heads integer not null check (heads between 1 and 4)
);
alter table public.segments enable row level security;
create policy "segments are public reading" on public.segments
  for select to anon, authenticated using (true);
insert into public.segments (slug, label, heads) values
  ('single_woman', 'Single woman', 1),
  ('single_man',   'Single man',   1),
  ('couple',       'Couple',       2);

create or replace function public.segment_heads(p_segment text)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$ select coalesce((select heads from public.segments where slug = p_segment), 1) $$;
grant execute on function public.segment_heads(text) to anon, authenticated;

-- The tier ladder, stated once.
create or replace function public.tier_rank(p_tier public.membership_tier)
returns integer
language sql
immutable
as $$ select case p_tier when 'regional' then 1 when 'national' then 2 when 'global' then 3 end $$;
grant execute on function public.tier_rank(public.membership_tier) to anon, authenticated;

-- The club's own clock, for the few places that speak in it rather than a
-- harbour's.
create or replace function public.club_zone()
returns text
language sql
immutable
as $$ select 'America/New_York'::text $$;
grant execute on function public.club_zone() to anon, authenticated;

-- The reasons that net to "knots this pass earned", stated once. Two
-- migrations had already been spent patching four copies of this list.
create or replace function public.knots_booking_reasons()
returns text[]
language sql
immutable
as $$ select array['Berth confirmed', 'Pass confirmed', 'Pass released', 'Sailing cancelled']::text[] $$;
grant execute on function public.knots_booking_reasons() to anon, authenticated;

-- The sponsor rate card, operations.md §5, as a table the console and the
-- credit line both read. sponsors.tier becomes a foreign key into it.
create table public.sponsor_tiers (
  slug text primary key,
  label text not null,
  position integer not null unique,
  rate_cents integer not null check (rate_cents >= 0),
  assets text[] not null default '{}'
);
alter table public.sponsor_tiers enable row level security;
create policy "the rate card is public reading" on public.sponsor_tiers
  for select to anon, authenticated using (true);
create policy "the bridge writes the rate card" on public.sponsor_tiers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant insert, update, delete on public.sponsor_tiers to authenticated;
insert into public.sponsor_tiers (slug, label, position, rate_cents, assets) values
  ('presenting_partner',  'Presenting Partner',   1, 1000000,
    array['Title naming', 'Full bar takeover', 'VIP lounge banner', 'App splash screen', 'Premier email placement', 'Footage rights in paid campaigns', '2 VIP passes a week']),
  ('sandbar_hub',         'Sandbar Hub',          2, 400000,
    array['Ring raft naming', 'Paddleboard wraps', 'Floating bar', 'Challenge leaderboard banner']),
  ('confessional_pod',    'Confessional Pod',     3, 300000,
    array['Booth backdrop logo', 'Prep-station placement', 'Watermark on downloaded clips']),
  ('shore_leave_partner', 'Shore Leave Partner',  4, 200000,
    array['Shuttle branding', 'Dining voucher presentation', 'Date reservation button on the match screen']);
alter table public.sponsors drop constraint if exists sponsors_tier_check;
alter table public.sponsors add constraint sponsors_tier_fkey
  foreign key (tier) references public.sponsor_tiers(slug) on update cascade;

-- Leagues, stated once, for the member_league view to join.
create table public.leagues (
  league smallint primary key,
  name text not null,
  months integer not null
);
alter table public.leagues enable row level security;
create policy "leagues are public reading" on public.leagues
  for select to anon, authenticated using (true);
insert into public.leagues (league, name, months) values
  (1, 'First League — Harborline', 0),
  (2, 'Second League — Soundings', 6),
  (3, 'Third League — Blue Water', 12),
  (4, 'Fourth League — Deep Water', 24),
  (5, 'Fifth League — The Trench', 48);;
