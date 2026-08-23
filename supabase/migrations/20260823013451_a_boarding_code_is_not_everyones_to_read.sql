-- "members read manifest" was SELECT USING (true) on rsvps, and RLS has no
-- column granularity — so every member could read every other member's whole
-- pass row, boarding_code included. That code is the credential encoded in the
-- stub QR and scanned at the gangway; the /stub page refuses to *show* someone
-- else's stub, but the credential itself was one query away.
--
-- The only member surface that legitimately reads another member's passes is
-- the directory's "voyages you both sailed", and it needs one column. That moves
-- to a definer, and the table closes to its owner and staff.
create or replace function public.shared_voyages(p_other uuid)
returns table(voyage_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.voyage_id
  from public.rsvps r
  where auth.uid() is not null
    and r.profile_id = p_other
    and r.status = 'aboard'
    and exists (
      select 1 from public.rsvps mine
      where mine.voyage_id = r.voyage_id
        and mine.profile_id = auth.uid()
        and mine.status = 'aboard'
    );
$$;

revoke execute on function public.shared_voyages(uuid) from public, anon;
grant execute on function public.shared_voyages(uuid) to authenticated;

comment on function public.shared_voyages(uuid) is
  'Voyages the caller and another member were both aboard for — the affinity list, without opening anyone''s pass row.';

drop policy if exists "members read manifest" on public.rsvps;

create policy "own passes or staff" on public.rsvps
  for select to authenticated
  using (profile_id = auth.uid() or public.is_staff());
