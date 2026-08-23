-- The DELETE policy asked `signatures` whether the guest had signed, and
-- signatures' own policy asks about rsvp_guests — so evaluating one policy
-- required evaluating the other, and Postgres refused the whole delete with
-- 42P17 infinite recursion. Staff could no longer remove any guest at all.
--
-- A definer answers the question without re-entering either policy.
create or replace function public.guest_has_signed(p_guest uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.signatures s where s.guest_id = p_guest);
$$;

revoke execute on function public.guest_has_signed(uuid) from public, anon;
grant execute on function public.guest_has_signed(uuid) to authenticated;

drop policy if exists "erase a guest who never signed" on public.rsvp_guests;
create policy "erase a guest who never signed" on public.rsvp_guests
  for delete to authenticated
  using (
    public.is_staff()
    or (
      not public.guest_has_signed(id)
      and (
        exists (select 1 from public.rsvps r
                 where r.id = rsvp_guests.rsvp_id and r.profile_id = auth.uid())
        or (rsvp_guests.rsvp_id is null and rsvp_guests.seated_by = auth.uid())
      )
    )
  );

-- And the three member views: sealing by revoking anon's grant makes them
-- answer 42501, when this codebase's rule — and its own invariant — is that a
-- sealed relation returns 200 with no rows. Their `where auth.uid() is not
-- null` already does the sealing; the grant was never what held the door.
grant select on public.member_league, public.member_engagement, public.member_affinity to anon;;
