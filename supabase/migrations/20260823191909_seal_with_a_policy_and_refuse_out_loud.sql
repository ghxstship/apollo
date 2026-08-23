-- Three corrections to the Shoreside and counter-signature work.

-- 1. Revoking anon's SELECT on thread_members made it fail with 42501 instead
--    of an empty result. This codebase's rule, written into its own invariant,
--    is that a table fails CLOSED through its policy: a permission error means
--    a caller is being stopped by a missing grant, which is how the public
--    gallery once lost the ability to read its own approved frames. RLS seals
--    thread_members already; the grant was never the thing holding the door.
grant select on public.thread_members to anon;

-- 2. guard_thread_seat quietly rewrote a member's tampered seat back to its old
--    values and returned success. That is the silent no-op this whole pass has
--    been removing: the caller is told the write landed. Refuse out loud.
create or replace function public.guard_thread_seat()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  if new.thread_id  is distinct from old.thread_id
     or new.profile_id is distinct from old.profile_id
     or new.joined_at  is distinct from old.joined_at then
    raise exception 'a seat is not yours to move';
  end if;
  return new;
end;
$$;

-- 3. Counter-signing broke because the Bridge writes the row with
--    `return=representation`, and dropping the old policy left staff with a
--    SELECT policy that exists but no INSERT/UPDATE of their own — the ALL
--    policy it used to rely on went with it. Staff curate the register.
drop policy if exists "staff curate counter-signatures" on public.counter_signatures;
create policy "staff curate counter-signatures" on public.counter_signatures
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());;
