-- guest_has_signed exists to break an RLS recursion: the DELETE policy on
-- pass_guests asks whether a guest has signed, and signatures' own policy asks
-- about pass_guests, so evaluating either required evaluating the other. A
-- definer answers without re-entering. That part is right and stays.
--
-- What was missing is a caller gate. It is granted to authenticated and takes
-- a bare uuid, so any signed-in member could ask of any guest id at all whether
-- that person has executed a waiver. Guest ids are uuids and not enumerable,
-- but they reach the manifest.
--
-- THE OBVIOUS GATE IS WRONG AND MUST NOT BE USED. Adding
-- "join passes p on p.id = g.rsvp_id and p.profile_id = auth.uid()" to the
-- body makes the function answer FALSE for a guest whose pass has been
-- detached — and 255 guests live have rsvp_id null, 45 of them still carrying a
-- signature. The delete policy reads `not guest_has_signed(id)`, so false means
-- "may be erased": that gate would open a delete path on forty-five executed
-- signatures. The seater branch of the policy is exactly the branch that could
-- walk through it.
--
-- So the answer stays honest for a caller entitled to it, and is TRUE for
-- everyone else. True is the safe constant: it is what the delete policy needs
-- to refuse, it is what a prober gets for every id they try, so it tells them
-- nothing, and it changes no existing outcome — a caller who is neither staff
-- nor the pass holder nor the seater is already refused by the policy's other
-- conjunct. Entitlement matches the policy's own definition of who may act on
-- a guest, detached guests included.
create or replace function public.guest_has_signed(p_guest uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.is_staff() then
      exists (select 1 from public.signatures s where s.guest_id = p_guest)
    when exists (
      select 1
        from public.pass_guests g
        left join public.passes r on r.id = g.rsvp_id
       where g.id = p_guest
         and (r.profile_id = (select auth.uid())
              or (g.rsvp_id is null and g.seated_by = (select auth.uid())))
    ) then
      exists (select 1 from public.signatures s where s.guest_id = p_guest)
    else true
  end;
$function$;

revoke execute on function public.guest_has_signed(uuid) from public, anon;
grant execute on function public.guest_has_signed(uuid) to authenticated;

comment on function public.guest_has_signed(uuid) is
  'Has this guest executed their paper. Answered honestly for the Bridge, for the member whose pass the guest sits on, and for whoever seated a detached guest; anyone else is told yes, which is the answer that refuses a deletion and reveals nothing.';
