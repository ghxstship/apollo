-- The cap became unbreakable and the counter became free to burn.
-- count_promo_use fires on any insert carrying a code, and rsvp_guard returns
-- early for anything that is not 'aboard' — so four waitlist-then-delete cycles
-- took a max_uses=1 code to uses=4 with an empty ledger. Any member could
-- exhaust every promotion the club runs without paying for anything.
--
-- It also counted a code booked against the WRONG sailing, which pass_price had
-- correctly declined to honour: full price charged, use consumed anyway.
--
-- A code is spent when it actually buys a pass — aboard, on the sailing it was
-- issued for. Anything else leaves the tally alone.
create or replace function public.count_promo_use()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare claimed int;
begin
  if new.promo_code is null then return new; end if;
  if new.status <> 'aboard' then return new; end if;
  if tg_op <> 'INSERT'
     and old.promo_code is not distinct from new.promo_code
     and old.status = 'aboard' then
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
    -- Not a live code for this sailing. pass_price has already charged full
    -- price; the booking stands and the code is simply not spent.
    return new;
  end if;

  return new;
end;
$$;

revoke execute on function public.count_promo_use() from public, anon, authenticated;;
