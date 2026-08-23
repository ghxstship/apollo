-- claim_promo_code sorts before guard_promo_code, so the guard saw the claim's
-- own stamp as a caller writing promo_claimed_at and reverted it — the two
-- triggers I had just written would have fought each other, and the claim would
-- never have stuck. Exactly the pattern this pass keeps finding; caught before
-- it shipped only because the stamp is testable.
create or replace function public.claim_promo_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare claimed int;
begin
  if new.promo_code is null then
    perform set_config('app.claiming_promo', 'on', true);
    new.promo_claimed_at := null;
    return new;
  end if;
  if new.status <> 'aboard' then return new; end if;
  if new.promo_claimed_at is not null then return new; end if;

  update public.promo_codes
     set uses = uses + 1
   where upper(code) = upper(btrim(new.promo_code))
     and active
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
     and (voyage_id is null or voyage_id = new.voyage_id)
  returning uses into claimed;

  perform set_config('app.claiming_promo', 'on', true);

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

revoke execute on function public.claim_promo_code() from public, anon, authenticated;;
