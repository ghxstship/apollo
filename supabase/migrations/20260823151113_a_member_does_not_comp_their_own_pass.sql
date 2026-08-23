-- The free pass, a third time, through the column that exists to skip the
-- charge. handle_rsvp_aboard skips pricing when comp is true or a promo code is
-- set — meant for a Bridge comp and for the checkout that posts the discounted
-- figure itself. Neither column was guarded, and the booking action sets both
-- from the MEMBER'S own client, so a member could write comp = true on their own
-- pass and board a priced sailing for nothing.
create or replace function public.guard_pass_exemptions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.comp, false) then
      raise exception 'a complimentary pass comes from the Bridge';
    end if;
  else
    if coalesce(new.comp, false) is distinct from coalesce(old.comp, false) then
      raise exception 'a complimentary pass comes from the Bridge';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_pass_exemptions() from public, anon, authenticated;

drop trigger if exists guard_pass_exemptions on public.rsvps;
create trigger guard_pass_exemptions
  before insert or update of comp on public.rsvps
  for each row execute function public.guard_pass_exemptions();

-- The price of a pass, including any promo the member named. One place, read
-- from the catalogue and the code table — never from the row the member wrote.
create or replace function public.pass_price(p_voyage uuid, p_promo text)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_price int; v_kind text; v_value int;
begin
  select price_cents into v_price from public.voyages where id = p_voyage;
  if v_price is null then return 0; end if;
  if coalesce(btrim(p_promo), '') = '' then return v_price; end if;

  select kind, value into v_kind, v_value
  from public.promo_codes
  where upper(code) = upper(btrim(p_promo))
    and active
    and (expires_at is null or expires_at > now())
    and (max_uses is null or uses < max_uses);

  if v_kind is null then return v_price; end if;
  if v_kind = 'comp' then return 0; end if;
  if v_kind = 'percent' then
    return greatest(0, v_price - round(v_price * greatest(0, v_value) / 100.0)::int);
  end if;
  return greatest(0, v_price - greatest(0, v_value));
end;
$$;

revoke execute on function public.pass_price(uuid, text) from public, anon;
grant execute on function public.pass_price(uuid, text) to authenticated;
