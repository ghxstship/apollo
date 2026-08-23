-- contest_standing ranks with rank(), which emits ties: two entrants tied for
-- first both carry place=1 and nobody carries place=2. The podium split paid
-- each place its full share, so a two-way tie for first paid 250+250+100 = 600
-- against a 500 award. A settled contest is the record, and it was overdrawing
-- the ledger.
--
-- Tied entrants now share the places they span: two tied for first pool the I
-- and II shares (250+150=400) and take 200 each, leaving III its 100. The
-- pooled amount is divided exactly — the remainder is handed out one knot at a
-- time in a deterministic order, so the payout always sums to the award.
create or replace function public.settle_contest(p_contest_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.contests;
  n        integer := 0;
  winners  integer := 0;
  v_second integer;
  v_third  integer;
  v_first  integer;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select * into c from public.contests where id = p_contest_id for update;
  if not found then raise exception 'no such contest'; end if;
  if c.status = 'settled' then raise exception 'already settled'; end if;
  if c.status <> 'open' then raise exception 'contest is not open'; end if;

  insert into public.contest_results (contest_id, profile_id, place, score, met)
  select p_contest_id, s.profile_id, s.place, s.score, s.met
  from public.contest_standing(p_contest_id) s
  on conflict (contest_id, profile_id) do update
    set place = excluded.place, score = excluded.score, met = excluded.met;
  get diagnostics n = row_count;

  if c.knots_award > 0 then
    if c.shape = 'regatta' then
      v_second := floor(c.knots_award * 0.30);
      v_third  := floor(c.knots_award * 0.20);
      v_first  := c.knots_award - v_second - v_third;

      with share as (
        select p, case p when 1 then v_first when 2 then v_second else v_third end amt
        from generate_series(1, 3) p
      ),
      podium as (
        select r.profile_id, r.place,
               count(*)    over (partition by r.place) tied,
               row_number() over (partition by r.place order by r.profile_id) seat
        from public.contest_results r
        where r.contest_id = p_contest_id and r.place between 1 and 3
      ),
      pooled as (
        select d.profile_id, d.place, d.tied, d.seat,
               (select coalesce(sum(s.amt), 0) from share s
                 where s.p >= d.place and s.p < d.place + d.tied) pot
        from podium d
      )
      insert into public.fathoms_ledger (profile_id, delta, reason)
      select pooled.profile_id,
             pot / tied + case when seat <= pot % tied then 1 else 0 end,
             case
               when tied > 1 then 'Tied at ' ||
                 (case place when 1 then 'I' when 2 then 'II' else 'III' end) || ' — ' || c.title
               when place = 1 then 'Won — ' || c.title
               when place = 2 then 'Placed II — ' || c.title
               else 'Placed III — ' || c.title
             end
      from pooled
      where pot / tied + case when seat <= pot % tied then 1 else 0 end > 0;
      get diagnostics winners = row_count;
    else
      insert into public.fathoms_ledger (profile_id, delta, reason)
      select r.profile_id, c.knots_award, 'Won — ' || c.title
      from public.contest_results r
      where r.contest_id = p_contest_id and r.met;
      get diagnostics winners = row_count;
    end if;
  end if;

  insert into public.notifications (profile_id, kind, title, body)
  select r.profile_id, 'word',
         c.title || ' — the result.',
         case
           when c.shape = 'regatta' and r.place = 1 then 'You took it. ' || coalesce(c.prize, '')
           when c.shape = 'regatta' and r.place in (2, 3) then 'You made the podium — ' || (case r.place when 2 then 'II' else 'III' end) || '. The standing is final.'
           when c.shape = 'regatta' then 'You finished ' || r.place::text || '. The standing is final.'
           when r.met then 'You reached it. ' || coalesce(c.prize, '')
           else 'The window has closed. The log stands.'
         end
  from public.contest_results r
  where r.contest_id = p_contest_id;

  update public.contests
  set status = 'settled', settled_at = now()
  where id = p_contest_id;

  return n;
end;
$function$;
