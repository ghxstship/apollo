-- Shoreside's ledger correction. The knots ledger is RPC-write-only, and the
-- Bridge had no way to grant or claw back an entry — every correction had to
-- masquerade as something else. One staff-only definer, reason required.
create or replace function public.adjust_knots(
  p_profile uuid,
  p_delta   integer,
  p_reason  text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_delta = 0 then raise exception 'a zero adjustment is not an entry'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'the ledger never writes without a reason'; end if;
  if not exists (select 1 from public.profiles where id = p_profile) then
    raise exception 'no such member';
  end if;

  insert into public.fathoms_ledger (profile_id, delta, reason)
  values (p_profile, p_delta, btrim(p_reason));
end;
$$;

revoke execute on function public.adjust_knots(uuid, integer, text) from public, anon;
grant execute on function public.adjust_knots(uuid, integer, text) to authenticated;

comment on function public.adjust_knots(uuid, integer, text) is
  'Staff-only ledger correction. Positive or negative, never zero, always with a reason the member can read.';
