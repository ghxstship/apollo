-- A member who only sails, or only follows one series, should not have to say
-- so every time they open the manifest. This holds the query string their
-- /episodes view opens with — the same string the pills write, so there is one
-- format for a filter set in this system and not two.
--
-- Text rather than jsonb on purpose: what is being stored IS a URL query
-- string, it round-trips byte for byte, and a jsonb shape would need a second
-- encoder on the way in and a decoder on the way out that could disagree with
-- URLSearchParams about arrays and empty values.
alter table public.profiles
  add column if not exists manifest_filters text;

comment on column public.profiles.manifest_filters is
  'Query string the member''s /episodes view opens with, e.g. setting=sea&series=anchor. Null means show everything.';

-- Bounded so the column cannot become somewhere to put arbitrary data. The
-- manifest writes at most seven short keys; 200 characters is roughly triple
-- the longest set the controls can produce.
alter table public.profiles
  drop constraint if exists profiles_manifest_filters_len;
alter table public.profiles
  add constraint profiles_manifest_filters_len
  check (manifest_filters is null or length(manifest_filters) <= 200);

-- UPDATE on this table is granted column by column rather than wholesale, so a
-- new column is unwritable until it is named here. That is the point of the
-- pattern and not an oversight to route around: a member may set their own
-- standing view, and the existing own-profile policy decides whose row.
grant update (manifest_filters) on public.profiles to authenticated;;
