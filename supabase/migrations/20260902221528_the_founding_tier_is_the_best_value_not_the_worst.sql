/* Founding was carrying $1,200 against $1,000 of dues — a 17% effective rate,
   worse than Owner's 29%. The most expensive rung on the ladder was the worst
   value on it, which is exactly backwards and which my own guard let through:
   it checked that a costlier plan carries MORE, not that it carries
   proportionally more. Absolute is not the same as rate.

   Founding is a patron tier and patron tiers are the best value per unit —
   that is what the money up front buys. It now carries $1,450 a month, or
   $17,400 a year against $10,000 of dues: enough to take the whole season
   ($8,925 at member rates) and bring someone to most of it, which is the
   promise the tier is actually making.

   The guard is rewritten to test the rate, so the ladder cannot invert this way
   again. */
update public.membership_plans
   set monthly_credit_cents = 145000
 where label = 'Founding' and active;

do $$
declare bad text;
begin
  /* Every paid plan, ordered by price, must carry a strictly better rate than
     the one below it. Access is exempt — it carries nothing and is priced at
     nothing, so it has no rate to compare. */
  select string_agg(
           b.label || ' ($' || (b.price_cents/100) || ') is worse value than ' ||
           a.label || ' ($' || (a.price_cents/100) || ')', '; ')
    into bad
  from public.membership_plans a
  join public.membership_plans b
    on a.active and b.active
   and a.price_cents > 0 and b.price_cents > a.price_cents
   and (b.monthly_credit_cents::numeric / b.price_cents)
     < (a.monthly_credit_cents::numeric / a.price_cents);
  if bad is not null then
    raise exception 'the dues ladder inverts on value: %', bad;
  end if;
end $$;;
