-- Two faults, and together they hand every promotion the club runs to any
-- member who wants it.
--
-- 1. The cap was read in one place and incremented in another. pass_price
--    checked `uses < max_uses` with no lock; count_promo_use — a separate
--    AFTER trigger — incremented with no cap check at all. Two concurrent
--    bookings on a max_uses=1 code both got the discount, and `uses` sailed
--    past the cap. On a `comp` code that is free passes, as many as you like.
--
-- 2. rsvps.promo_code was freely PATCHable after the fact. rsvp_guard covers
--    status and guests only, so a member could rewrite the code on their own
--    pass — no re-pricing, no charge, but the AFTER trigger fired every time.
--    Six PATCHes burned a max_uses=1 code to 3. Any member could exhaust every
--    promotion in the club without paying for anything.
--
-- The claim and the count become one statement, taken where the row is locked,
-- and the code a pass was booked with stops being editable.

create or replace function public.count_promo_use()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare claimed int;
begin
  if new.promo_code is null then return new; end if;
  if tg_op <> 'INSERT' and old.promo_code is not distinct from new.promo_code then
    return new;
  end if;

  -- Claim and count in one statement: the WHERE is the cap, and a row comes
  -- back only if this caller got it. Concurrent claimers serialise on the row.
  update public.promo_codes
     set uses = uses + 1
   where code = new.promo_code
     and active
     and (expires_at is null or expires_at > now())
     and (max_uses is null or uses < max_uses)
  returning uses into claimed;

  if claimed is null then
    raise exception 'that code is spent';
  end if;

  return new;
end;
$$;

revoke execute on function public.count_promo_use() from public, anon, authenticated;

-- The code a pass was booked under is part of what it was priced at. Changing
-- it afterwards prices nothing and only burns the code.
create or replace function public.guard_promo_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;
  if new.promo_code is distinct from old.promo_code then
    raise exception 'a code is applied when the pass is booked, not after';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_promo_code() from public, anon, authenticated;

drop trigger if exists guard_promo_code on public.rsvps;
create trigger guard_promo_code
  before update of promo_code on public.rsvps
  for each row execute function public.guard_promo_code();;
