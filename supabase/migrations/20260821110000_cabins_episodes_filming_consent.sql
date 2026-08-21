-- Syrius enrichment, the data layer: cabins, episodes, filming consent.
--
-- CABINS. The kit's booking flow is charter -> cabin & add-ons -> review ->
-- boarding stub, and the hero counts them ("12 cabins"). A cabin is a named
-- space on a vessel with berths; a pass may claim one. Admission stays
-- per-pass — the cabin is where you sleep, not whether you board — so
-- voyage_capacity and the metering guard are untouched.
create table if not exists public.cabins (
  id         uuid primary key default gen_random_uuid(),
  vessel_id  uuid not null references public.vessels (id) on delete cascade,
  name       text not null,
  berths     integer not null default 2 check (berths > 0),
  -- surcharge over the charter's pass price, in cents; 0 = included
  premium_cents integer not null default 0 check (premium_cents >= 0),
  position   integer not null default 0,
  active     boolean not null default true,
  unique (vessel_id, name)
);

alter table public.rsvps
  add column if not exists cabin_id uuid references public.cabins (id) on delete set null;

alter table public.cabins enable row level security;

-- The cabin plan is public the way the fleet is: the booking page shows it.
create policy "cabins are public" on public.cabins
  for select using (true);
create policy "staff keep cabins" on public.cabins
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke insert, update, delete on public.cabins from anon;

-- A cabin holds so many berths; claims beyond that are refused at the line.
create or replace function public.guard_cabin_capacity()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  cap integer;
  taken integer;
begin
  if new.cabin_id is null or new.cabin_id is not distinct from old.cabin_id then
    return new;
  end if;
  select berths into cap from public.cabins where id = new.cabin_id and active;
  if cap is null then raise exception 'no such cabin'; end if;
  select count(*) into taken from public.rsvps
  where voyage_id = new.voyage_id and cabin_id = new.cabin_id
    and status = 'aboard' and id <> new.id;
  if taken >= cap then
    raise exception 'that cabin is spoken for — % berths, all claimed', cap;
  end if;
  return new;
end;
$$;

drop trigger if exists rsvp_cabin_capacity on public.rsvps;
create trigger rsvp_cabin_capacity
before insert or update of cabin_id on public.rsvps
for each row execute function public.guard_cabin_capacity();
revoke execute on function public.guard_cabin_capacity() from public, anon, authenticated;

-- Seed a cabin plan per hull: enough to make "choice of cabin" a real object.
insert into public.cabins (vessel_id, name, berths, premium_cents, position)
select v.id, c.name, c.berths, c.premium, c.pos
from public.vessels v
cross join (values
  ('Owner''s cabin', 2, 8000, 1),
  ('Forward double', 2, 4000, 2),
  ('Port twin', 2, 0, 3),
  ('Starboard twin', 2, 0, 4)
) as c(name, berths, premium, pos)
on conflict (vessel_id, name) do nothing;

-- EPISODES. What the cameras kept, per charter. dispatch_posts stays the
-- long-form editorial; episodes are the show's structure.
create table if not exists public.episodes (
  id        uuid primary key default gen_random_uuid(),
  voyage_id uuid references public.voyages (id) on delete set null,
  number    integer not null,
  slug      text unique not null,
  title     text not null,
  dek       text,
  state     text not null default 'draft' check (state in ('draft', 'published')),
  aired_at  timestamptz,
  unique (number)
);

alter table public.episodes enable row level security;
create policy "published episodes are public" on public.episodes
  for select using (state = 'published' or public.is_staff());
create policy "staff keep episodes" on public.episodes
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke insert, update, delete on public.episodes from anon;

insert into public.episodes (voyage_id, number, slug, title, dek, state, aired_at)
select v.id, e.num, e.slug, e.title, e.dek, 'published', v.starts_at + interval '9 days'
from (values
  ('season-i-winter-crossing', 1, 'cast-off', 'Strangers at the gangway', 'Phones in the drawer. Introductions on deck. The bar opens at sunset.'),
  ('season-i-port-night-i', 2, 'first-table', 'The dinner that went sideways', 'Two strangers, one table, zero producers stepping in.'),
  ('season-i-night-passage', 3, 'confession', 'What the cameras missed', 'The confession booth is open all night. Someone always talks.')
) as e(vslug, num, slug, title, dek)
join public.voyages v on v.slug = e.vslug
on conflict (slug) do nothing;

-- FILMING CONSENT. A filmed product makes the appearance release a legal
-- object. Three clauses join the library and compose into the waivers' next
-- versions; the toggle on /you records the standing choice; withdrawal is a
-- fact with a timestamp, surfaced to the crew on the manifest.
insert into public.clauses (code, title, category, position) values
  ('filming-release',  'Appearance and filming', 'media', 14),
  ('voice-likeness',   'Voice and likeness',     'media', 15),
  ('minor-appearance', 'Minors on camera',       'media', 16)
on conflict (code) do nothing;

insert into public.clause_versions (clause_code, version, body, note)
select v.code, 1, v.body, 'Syrius filming-consent set, v1'
from (values
  ('filming-release',
   'Appearance and filming. The cameras run from boarding to docking. By boarding you agree to be filmed and photographed, and to the use of that footage in the show and its promotion. You may decline to appear: tell the crew before boarding or toggle it in your settings, and production will keep you out of frame and out of the cut.'),
  ('voice-likeness',
   'Voice and likeness. What the microphones catch is part of the footage, on the same terms and with the same right to decline. Nothing recorded is sold to third parties; the footage is the show''s and only the show''s.'),
  ('minor-appearance',
   'Minors on camera. A guest under eighteen appears on camera only with the signing adult''s explicit consent, given here. Without it, production keeps them out of frame — the default is off.')
) as v(code, body)
where not exists (select 1 from public.clause_versions cv where cv.clause_code = v.code and cv.version = 1);

-- Standing consent, on the profile: the default is on for the cast — it is a
-- filmed show — and withdrawal is honored at the next port.
alter table public.profiles
  add column if not exists on_camera boolean not null default true,
  add column if not exists camera_withdrawn_at timestamptz;

comment on column public.profiles.on_camera is
  'Standing filming consent. Withdrawal is honored at the next port; the crew sees it on the manifest.';

-- The guard trigger must allow a member to change their own consent; it only
-- restricts the privileged columns, so no change needed — asserted by e2e.

-- Guests: per-sailing consent, captured at signing time via the guardian field
-- and the waiver itself; a per-guest off-camera flag for the crew sheet.
alter table public.rsvp_guests
  add column if not exists on_camera boolean not null default true;
