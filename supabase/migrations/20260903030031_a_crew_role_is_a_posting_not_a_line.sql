-- The public /crew page carried four roles hardcoded in the file and never read
-- this table, so the two drifted: the page had been corrected to Gangway ops
-- while the row still said Harbormaster ops, a surface name this brand retired.
-- One of them had to become the source, and it is this one — a role that opens
-- or closes should not need a deploy.
--
-- A posting is also more than a line. The table held a title, a city and one
-- blurb, which is a listing entry; a candidate deciding whether to apply wants
-- the work, the bar, the money and the shape of the process.

alter table public.crew_roles
  add column if not exists slug text,
  add column if not exists dept text,
  add column if not exists employment text,
  add column if not exists remote boolean not null default false,
  add column if not exists body text,
  add column if not exists responsibilities text[] not null default '{}',
  add column if not exists requirements text[] not null default '{}',
  add column if not exists nice_to_have text[] not null default '{}',
  add column if not exists comp text,
  add column if not exists process text[] not null default '{}',
  add column if not exists posted_at timestamptz not null default now();

-- The two titles the page had already fixed and the table had not.
update public.crew_roles set title = 'Gangway ops'
  where title = 'Harbormaster ops';
update public.crew_roles set title = 'The Producer engineering'
  where title = 'Producer systems engineering';

-- Slugs from the titles, then made the addressable key they are about to be.
update public.crew_roles
set slug = regexp_replace(lower(btrim(title)), '[^a-z0-9]+', '-', 'g')
where slug is null;
update public.crew_roles set slug = btrim(slug, '-');

alter table public.crew_roles alter column slug set not null;
create unique index if not exists crew_roles_slug_key on public.crew_roles (slug);

comment on column public.crew_roles.slug is
  'Addressable key for /crew/<slug>. Stable once published — a live posting''s URL is on somebody''s clipboard.';
comment on column public.crew_roles.comp is
  'Written as prose, not a number range, because the club states pay in its own words. Null renders nothing rather than an empty heading.';
;
