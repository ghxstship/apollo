-- Counting the use in an AFTER trigger leaves pricing and counting able to
-- disagree. on_rsvp_aboard (which prices via pass_price) sorts before
-- on_rsvp_promo_used, so under a race both bookings were priced with the
-- discount and only one claim landed: two half-price passes against a
-- max_uses=1 code. Raising in the AFTER trigger instead aborted whole bookings
-- for a merely-expired code, which is not what an expired code should do.
--
-- Claim first, in a BEFORE trigger, in one locked statement — and if the claim
-- does not land, strip the code off the row so pass_price prices it at full
-- price a moment later. The pass is still booked; it simply is not discounted.
drop trigger if exists on_rsvp_promo_used on public.rsvps;

create or replace function public.claim_promo_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare claimed int;
begin
  if new.promo_code is null then return new; end if;
  if new.status <> 'aboard' then return new; end if;

  -- Already claimed on a previous pass through: nothing more to take.
  if tg_op = 'UPDATE'
     and old.status = 'aboard'
     and old.promo_code is not distinct from new.promo_code then
    return new;
  end if;

  update public.promo_codes
     set uses = uses + 1
   where code = new.promo_code
     and active
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
     and (voyage_id is null or voyage_id = new.voyage_id)
  returning uses into claimed;

  if claimed is null then
    -- Spent, expired, withdrawn, or for another sailing. The booking stands at
    -- list price and the tally is untouched.
    new.promo_code := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.claim_promo_code() from public, anon, authenticated;

-- Before rsvp_guard and long before the AFTER pricing pass. The name sorts
-- ahead of guard_* so the code is settled before anything reads it.
create trigger claim_promo_code
  before insert or update of status, promo_code on public.rsvps
  for each row execute function public.claim_promo_code();

drop function if exists public.count_promo_use();;
