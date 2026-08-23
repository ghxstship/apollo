-- The claim's idempotence test was `old.status = 'aboard' and the code is
-- unchanged`, so a not_going → aboard round-trip re-claimed. The row still
-- carried the code, so guard_promo_code never fired, and three release/rebook
-- cycles — each taking a full 48h credit — took a max_uses=5 code to 4 uses
-- against one paid pass. Any member could still exhaust every promotion.
--
-- Status is the wrong thing to hang it on. The pass remembers whether its own
-- code has been spent.
alter table public.rsvps
  add column if not exists promo_claimed_at timestamptz;

-- Anything aboard with a code today has already been counted.
update public.rsvps
   set promo_claimed_at = coalesce(promo_claimed_at, now())
 where promo_code is not null and status = 'aboard' and promo_claimed_at is null;

create or replace function public.claim_promo_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare claimed int;
begin
  if new.promo_code is null then
    new.promo_claimed_at := null;
    return new;
  end if;
  if new.status <> 'aboard' then return new; end if;

  -- Already spent for this pass. Releasing and re-booking does not buy a
  -- second use of the same code.
  if new.promo_claimed_at is not null then return new; end if;

  update public.promo_codes
     set uses = uses + 1
   where upper(code) = upper(btrim(new.promo_code))
     and active
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
     and (voyage_id is null or voyage_id = new.voyage_id)
  returning uses into claimed;

  if claimed is null then
    new.promo_code := null;
    new.promo_claimed_at := null;
    return new;
  end if;

  new.promo_claimed_at := now();
  perform set_config('app.promo_claimed', upper(btrim(new.promo_code)), true);
  return new;
end;
$$;

revoke execute on function public.claim_promo_code() from public, anon, authenticated;

drop trigger if exists claim_promo_code on public.rsvps;
create trigger claim_promo_code
  before insert or update of status, promo_code on public.rsvps
  for each row execute function public.claim_promo_code();

-- Applying a code to a pass that has none is a first application, not a swap —
-- and a member whose code was stripped because they lost the race could
-- otherwise never apply one to that pass again. Swapping one code for another
-- stays refused.
create or replace function public.guard_promo_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;
  if new.promo_code is distinct from old.promo_code
     and old.promo_code is not null then
    raise exception 'a code is applied when the pass is booked, not swapped after';
  end if;
  if new.promo_claimed_at is distinct from old.promo_claimed_at
     and coalesce(current_setting('app.claiming_promo', true), 'off') <> 'on' then
    -- Written only by claim_promo_code.
    new.promo_claimed_at := old.promo_claimed_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_promo_code() from public, anon, authenticated;

-- A pass that changes hands does not carry the giver's discount with it; the
-- taker is charged what the giver actually stood out of pocket.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'accept_pass_transfer' limit 1;

  newsrc := replace(src,
    '     set profile_id = t.to_profile, boarding_code = new_code,',
    '     set profile_id = t.to_profile, boarding_code = new_code,' || chr(10) ||
    '         promo_code = null, promo_claimed_at = null,');

  if newsrc = src then
    raise exception 'could not clear the promo code on hand-off';
  end if;
  execute newsrc;
end $outer$;;
