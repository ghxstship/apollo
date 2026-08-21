-- The kit's ContestComposer states the award rule: "Paid on settle; regattas
-- split I / II / III." A regatta's knots_award now splits 50 / 30 / 20 across
-- the podium, rounding remainder to I. Ties at a place each take that place's
-- full share. Challenges are unchanged: everyone who reached the target is
-- paid the full award.
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

      insert into public.fathoms_ledger (profile_id, delta, reason)
      select r.profile_id,
             case r.place when 1 then v_first when 2 then v_second else v_third end,
             case r.place
               when 1 then 'Won — ' || c.title
               when 2 then 'Placed II — ' || c.title
               else 'Placed III — ' || c.title
             end
      from public.contest_results r
      where r.contest_id = p_contest_id
        and r.place between 1 and 3
        and case r.place when 1 then v_first when 2 then v_second else v_third end > 0;
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
