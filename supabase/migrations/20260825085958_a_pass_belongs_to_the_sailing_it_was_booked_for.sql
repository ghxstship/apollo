-- Seventeen triggers guard public.rsvps and not one of them fires on voyage_id.
-- `authenticated` holds UPDATE on every column, and the "own rsvp update" policy
-- checks only profile_id — so a member could PATCH voyage_id and walk their own
-- pass onto any sailing in the fleet. Nothing fired: not the ratio gate, not the
-- vetting gate, not capacity, not min_tier, not the booking window, not the
-- monthly allowance, not rsvp_not_in_the_past, and not on_rsvp_aboard — which is
-- what prices and charges a pass, so the move was also free.
--
-- profile_id needs no guard: the policy pins it to auth.uid() in USING *and*
-- WITH CHECK, so a pass can be neither stolen nor given away by hand, and
-- accept_pass_transfer is SECURITY DEFINER and goes around RLS entirely.
--
-- This trigger takes no `update of` column list on purpose. A column list is the
-- exact mechanism that failed above; firing on every update costs one function
-- call and cannot be defeated by a column nobody remembered to add.
create or replace function public.guard_pass_stays_on_its_sailing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_staff() then return new; end if;
  if new.voyage_id is distinct from old.voyage_id then
    raise exception 'a pass belongs to the sailing it was booked for — release it and book the other one';
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_pass_stays_on_its_sailing() from public, anon, authenticated;

drop trigger if exists rsvp_stays_on_its_sailing on public.rsvps;
create trigger rsvp_stays_on_its_sailing
  before update on public.rsvps
  for each row execute function public.guard_pass_stays_on_its_sailing();

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.rsvps'::regclass
                    and tgname = 'rsvp_stays_on_its_sailing'
                    and tgattr = '')
  then
    raise exception 'the pass guard must fire on every update, not a column list';
  end if;
end $$;;
