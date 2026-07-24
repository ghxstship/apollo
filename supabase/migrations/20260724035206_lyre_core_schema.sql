-- LYRE SOCIAL core schema
create type public.membership_tier as enum ('regional','national','global');
create type public.event_class as enum ('sea','shore','sky');
create type public.voyage_status as enum ('scheduled','live','weather_hold','completed','cancelled');
create type public.rsvp_status as enum ('aboard','waitlist','not_going');
create type public.application_status as enum ('received','review','invited','aboard');

-- Harbors (chapters)
create table public.harbors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  status text not null default 'soon', -- open | waitlist | soon
  coordinates text,
  launch_year int,
  position int not null default 0
);

-- Member profiles (1:1 with auth.users)
create sequence public.member_no_seq start 27;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  member_no text unique,
  full_name text,
  handle text unique,
  email text,
  tier public.membership_tier not null default 'regional',
  home_harbor uuid references public.harbors(id),
  avatar_tone text not null default 'ink',
  is_staff boolean not null default false,
  joined_at timestamptz not null default now()
);

-- Voyages & salons
create table public.voyages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  class public.event_class not null,
  kind text not null default 'voyage', -- voyage | salon
  harbor_id uuid references public.harbors(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  coordinates text,
  distance_nm numeric,
  berths_total int not null default 24,
  price_cents int not null default 0,
  status public.voyage_status not null default 'scheduled',
  blurb text,
  description text,
  media text not null default 'day', -- day | dusk | dawn (placeholder gradients)
  min_tier public.membership_tier not null default 'regional',
  created_at timestamptz not null default now()
);

-- RSVPs (berths)
create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  voyage_id uuid not null references public.voyages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status public.rsvp_status not null default 'aboard',
  guests int not null default 0 check (guests between 0 and 4),
  created_at timestamptz not null default now(),
  unique (voyage_id, profile_id)
);

-- Fathoms (loyalty ledger)
create table public.fathoms_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null,
  reason text not null,
  voyage_id uuid references public.voyages(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The Wardroom (member feed)
create table public.wardroom_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade,
  author_name text, -- display fallback for seeded/legacy posts
  body text not null check (char_length(body) between 1 and 2000),
  voyage_id uuid references public.voyages(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.wardroom_hails (
  post_id uuid not null references public.wardroom_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create table public.wardroom_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.wardroom_posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade,
  author_name text,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- The Dispatch (editorial)
create table public.dispatch_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  dek text,
  body text,
  tag text,
  published_at timestamptz not null default now()
);

-- Membership applications (public funnel)
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  city text,
  referral text,
  note text,
  status public.application_status not null default 'received',
  created_at timestamptz not null default now()
);

-- Word (notification inbox)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'word', -- word | manifest | weather | fathoms
  title text not null,
  body text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index on public.rsvps (profile_id);
create index on public.rsvps (voyage_id);
create index on public.fathoms_ledger (profile_id);
create index on public.wardroom_posts (created_at desc);
create index on public.wardroom_comments (post_id);
create index on public.notifications (profile_id, read);
create index on public.voyages (starts_at);
