-- rsvp_guests.boarding_code has been UNIQUE since it was created. rsvps.boarding_code
-- never was, and it is the credential the gangway matches on to decide that a
-- named person may walk aboard.
--
-- The mint makes a collision reachable rather than theoretical:
--   'UN-' || left(slug_alpha,4) || '-' || to_char(starts_at,'MMDD') || '-' || right(member_no,4)
-- No year and no randomness. Two sailings a year apart whose slugs start with
-- the same four letters hand the same member the identical code twice — and the
-- "which sailing was this pass for?" lookup is .eq(code).maybeSingle(), which
-- returns PGRST116 on two rows, so the holder of a genuine pass would be told
-- their code matches nothing: the forgery message, to the person holding the
-- real thing.
--
-- Uniqueness is enforced ACROSS THE MAPPING, not on the stored string. The
-- gangway folds retired prefixes onto the current one before it looks anybody
-- up, so SYR-ABCD and UN-ABCD are the same credential at the door even though
-- they are different values in the column. An index on the raw text would call
-- that pair distinct and admit exactly the collision that matters.
--
-- Zero duplicates today, stored or mapped, across both tables — checked before
-- adding this, so it cannot fail on existing data.
create or replace function public.boarding_code_key(code text)
returns text
language sql
immutable
set search_path to 'public'
as $$ select regexp_replace(upper(btrim(coalesce(code, ''))), '^(SYR|LS|LYR|LYRE)-', 'UN-') $$;

create unique index if not exists rsvps_boarding_code_once
  on public.rsvps (public.boarding_code_key(boarding_code))
  where boarding_code is not null;

create unique index if not exists rsvp_guests_boarding_code_mapped_once
  on public.rsvp_guests (public.boarding_code_key(boarding_code))
  where boarding_code is not null;

do $$
declare n int;
begin
  -- the index must exist AND actually refuse a collision that only appears
  -- after mapping, which is the case a plain unique index would miss
  select count(*) into n from pg_indexes
   where tablename = 'rsvps' and indexname = 'rsvps_boarding_code_once';
  if n <> 1 then raise exception 'the boarding-code index was not created'; end if;

  if public.boarding_code_key('SYR-ABCD-0101-0001') <> public.boarding_code_key('UN-ABCD-0101-0001') then
    raise exception 'the mapping key does not fold a retired prefix onto the current one';
  end if;
  if public.boarding_code_key('UN-AAAA-0101-0001') = public.boarding_code_key('UN-BBBB-0101-0001') then
    raise exception 'the mapping key collapses codes that are genuinely different';
  end if;
end $$;;
