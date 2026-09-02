/* Model C, approved by the owner 2026-09-02. Season I is priced.

   Five published prices, each read off a column the taxonomy already has, so
   there is nothing new to model and nothing new for a member to learn:

     passage   (sub_class)              $85
     expedition(sub_class)             $165
     away      (experience_class exotic) $275
     anchor    (series)                 $250
     charter   (premium, not anchor)    $850

   ANCHOR IS CHEAPER THAN AWAY ON PURPOSE. A hundred people on one boat cost
   about $175 a head; twenty people driven to a polo field cost about $265. The
   flagship is the cheapest thing in the season to run per head and the only one
   that clears its cost at a price the market pays, so it is also the front
   door. The expensive things are the ones that leave the city.

   THE PASSAGE LINE RUNS AT A PLANNED LOSS of roughly $33 a head against an
   estimated $118 cost. Sixteen episodes at 25 heads is about $13,000 a season —
   the price of the habit that makes dues worth paying. Filling the room to 35
   removes it; that is an operations answer, not a pricing one.

   COST FIGURES ARE ESTIMATES except Anchor's, which come from the owner's own
   90-day model. Replace them with real venue and vendor quotes before treating
   any margin here as fact.

   Deposits go on Anchor and Away only: both are low-capacity or weather-exposed
   and both carry a cancellation cost the club cannot recover. Seventeen of the
   fifty-two episodes fall in Miami's soft season and four of the twelve Anchors
   sit inside the hurricane window, which is what the deposit is actually for. A
   three-hour rooftop needs no deposit and asking for one would read as
   distrust. */
do $$
declare n int; total int := 0;
begin
  update public.episodes
     set price_cents = 8500, deposit_required = false
   where slug like 's1-w%' and experience_class = 'club' and sub_class = 'passage';
  get diagnostics n = row_count; total := total + n;
  raise notice 'passage priced: % episodes', n;

  update public.episodes
     set price_cents = 16500, deposit_required = false
   where slug like 's1-w%' and experience_class = 'club' and sub_class = 'expedition';
  get diagnostics n = row_count; total := total + n;
  raise notice 'expedition priced: % episodes', n;

  update public.episodes
     set price_cents = 27500, deposit_required = true, deposit_cents = 5000
   where slug like 's1-w%' and experience_class = 'exotic';
  get diagnostics n = row_count; total := total + n;
  raise notice 'away priced: % episodes', n;

  update public.episodes
     set price_cents = 25000, deposit_required = true, deposit_cents = 5000
   where slug like 's1-w%' and series = 'anchor';
  get diagnostics n = row_count; total := total + n;
  raise notice 'anchor priced: % episodes', n;

  /* The one premium episode that is not Anchor: a private racetrack night at
     roughly $750 a head to run. Priced rather than quoted because an episode
     with a zero price renders as COMPLIMENTARY, and a free supercar night is
     the single most expensive typo this catalogue could ship. */
  update public.episodes
     set price_cents = 85000, deposit_required = true, deposit_cents = 25000
   where slug like 's1-w%' and experience_class = 'premium' and series <> 'anchor';
  get diagnostics n = row_count; total := total + n;
  raise notice 'charter priced: % episodes', n;

  if total <> 52 then
    raise exception 'priced % of 52 episodes — the grid does not cover the season', total;
  end if;
end $$;

/* Nothing in Season I may still read as free. price_cents defaults to zero and
   zero renders as COMPLIMENTARY, which is how all fifty-two advertised
   themselves until now. */
do $$
declare free_ones text;
begin
  select string_agg(slug, ', ')
    into free_ones
  from public.episodes
  where slug like 's1-w%' and coalesce(price_cents, 0) = 0;
  if free_ones is not null then
    raise exception 'still priced at zero and therefore reading as complimentary: %', free_ones;
  end if;
end $$;;
