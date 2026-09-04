-- The strike guard only refused inside the 48-hour window. Outside it the
-- delete cascades into passes, and the release trigger then looks the episode
-- up to decide whether a credit is due — the row is already gone, the test
-- evaluates to null, and no credit is posted. Thirty days out, a struck episode
-- left the member minus the pass price with no pass and no word. Money on the
-- book means cancel; strike is for an empty one.
create or replace function public.an_episode_inside_the_window_is_cancelled_not_struck()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare owed integer;
begin
  if exists (select 1 from public.passes r where r.episode_id = old.id and r.status = 'aboard') then
    select coalesce(-sum(l.delta_cents), 0) into owed
    from public.account_ledger l where l.episode_id = old.id;
    if owed > 0 then
      raise exception 'an episode with money on its book is cancelled, not struck — cancel it and the folios square themselves';
    end if;
  end if;
  return old;
end $function$;;
