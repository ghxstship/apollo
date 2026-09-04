-- The guard before this one refused to strike any episode with money on its
-- book and told the operator to cancel first. Correct about the money, wrong
-- about the shape: a refusal that names a second action is a guard that
-- makes the operator do the machine's work, and the suite's own teardown —
-- which strikes every fixture it makes — hit it fifty times. The cancellation
-- machinery already does everything a strike owes the members: full credit,
-- the plan credit back, the word to everyone holding a pass, the knots
-- returned. So a strike of a live episode with money on it CANCELS it first,
-- inside the same statement, and then lets it go. A completed episode keeps
-- its book (the money was earned) and is struck as before; the ledger rows
-- simply lose their episode.
create or replace function public.an_episode_inside_the_window_is_cancelled_not_struck()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare owed integer;
begin
  if old.status in ('scheduled', 'live', 'weather_hold')
     and exists (select 1 from public.passes r where r.episode_id = old.id and r.status = 'aboard') then
    select coalesce(-sum(l.delta_cents), 0) into owed
    from public.account_ledger l where l.episode_id = old.id;
    if owed > 0 then
      update public.episodes set status = 'cancelled' where id = old.id;
    end if;
  end if;
  return old;
end $function$;;
