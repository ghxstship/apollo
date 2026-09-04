-- city_tax has existed since the 3rd with nowhere to record a determination
-- and nothing reading one. tax_cents was stamped by exactly one writer, the
-- dues webhook, from what Stripe Tax computed. A pass, a deposit, an add-on, a
-- bar tab or a shop order was charged with no tax at all, in a state that
-- taxes admissions — and even with the rate in hand there was no code path
-- that would have applied it.
--
-- This is that path. It charges NOTHING until a city's row carries a rate AND
-- the club is registered to collect there. Null rate: undetermined, no tax.
-- Zero rate: determined untaxed, no tax. Rate with registered = false: the
-- club is not entitled to collect it, no tax, and the Bridge shows the gap.
--
-- Additive, on top of the catalogue price. The price a member sees is the
-- club's price; the tax is the state's, added at the line. delta_cents
-- carries the total, tax_cents the part of it that is tax, which is the same
-- shape the dues row already has. A release credits the whole row back, tax
-- included, because the sums that compute the release read delta_cents.
--
-- Which rate for which line: admissions for a pass, its deposit and its
-- add-ons (they are part of the admission); goods for the galley and the
-- shop. The city is the episode's for anything on an episode, and the
-- member's home city for the shop.

create or replace function public.tax_cents_for(p_city uuid, p_kind text, p_cents integer)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select case
             when not t.registered then 0
             when p_kind in ('pass','deposit','addon') then round(p_cents * coalesce(t.admissions_rate_bp, 0) / 10000.0)::int
             when p_kind in ('galley','shop')          then round(p_cents * coalesce(t.goods_rate_bp, 0) / 10000.0)::int
             else 0
           end
    from public.city_tax t
    where t.city_id = p_city
  ), 0);
$function$;

revoke all on function public.tax_cents_for(uuid, text, integer) from public, anon, authenticated;

create or replace function public.a_charge_carries_its_tax()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_city uuid;
  v_tax  integer;
begin
  /* Charges only, and only the kinds a state taxes. A row that already says
     what its tax is — the dues row, from Stripe — is left alone. */
  if new.delta_cents >= 0 or coalesce(new.tax_cents, 0) <> 0
     or new.kind not in ('pass','deposit','addon','galley','shop') then
    return new;
  end if;

  if new.episode_id is not null then
    select e.city_id into v_city from public.episodes e where e.id = new.episode_id;
  else
    select p.home_city into v_city from public.profiles p where p.id = new.profile_id;
  end if;
  if v_city is null then return new; end if;

  v_tax := public.tax_cents_for(v_city, new.kind, -new.delta_cents);
  if v_tax > 0 then
    new.delta_cents := new.delta_cents - v_tax;
    new.tax_cents := v_tax;
  end if;
  return new;
end $function$;

revoke all on function public.a_charge_carries_its_tax() from public, anon, authenticated;

drop trigger if exists a_charge_carries_its_tax on public.account_ledger;
create trigger a_charge_carries_its_tax
  before insert on public.account_ledger
  for each row execute function public.a_charge_carries_its_tax();

-- Every city, not only the open ones: an operator opening the console sees
-- the whole roster and which rows still await a determination.
insert into public.city_tax (city_id, note)
select id, 'Awaiting a determination — no rate has been set and none is assumed.'
from public.cities
on conflict (city_id) do nothing;;
