-- Claiming before pricing fixed the race and broke the discount: the claim
-- increments `uses`, and pass_price then read `uses < max_uses` as false and
-- charged the winner full price. The last member to use a code paid list for it.
--
-- The claim is the decision. pass_price is told, for the length of that one
-- transaction, that this code has already been claimed here — so it prices what
-- was claimed instead of re-litigating a cap the claim has already consumed.
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
    new.promo_code := null;
    return new;
  end if;

  -- This transaction holds a claim on this code. pass_price honours it.
  perform set_config('app.promo_claimed', upper(new.promo_code), true);
  return new;
end;
$$;

revoke execute on function public.claim_promo_code() from public, anon, authenticated;

create or replace function public.pass_price(p_voyage uuid, p_promo text default null)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_price int; v_kind text; v_value int; v_claimed boolean;
begin
  select price_cents into v_price from public.voyages where id = p_voyage;
  if v_price is null then return 0; end if;
  if coalesce(btrim(p_promo), '') = '' then return v_price; end if;

  -- A claim taken a moment ago in this same transaction has already consumed a
  -- use; re-testing the cap here would price the claimant at full price.
  v_claimed := coalesce(current_setting('app.promo_claimed', true), '') = upper(btrim(p_promo));

  select kind, value into v_kind, v_value
  from public.promo_codes
  where upper(code) = upper(btrim(p_promo))
    and active
    and (expires_at is null or expires_at > now())
    and (v_claimed or max_uses is null or uses < max_uses)
    and (voyage_id is null or voyage_id = p_voyage);

  if v_kind is null then return v_price; end if;
  if v_kind = 'comp' then return 0; end if;
  if v_kind = 'percent' then
    return greatest(0, v_price - round(v_price * greatest(0, v_value) / 100.0)::int);
  end if;
  return greatest(0, v_price - greatest(0, v_value));
end;
$$;;
