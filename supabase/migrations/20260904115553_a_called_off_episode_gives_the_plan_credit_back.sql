-- When the club cancels, handle_episode_status credits what the member is
-- owed in cash — which for a pass the plan paid is nothing — and leaves the
-- month's allowance marked spent. The release path already returns it; the
-- cancellation path is the club's own doing and owes at least as much. Post the
-- reversal and its matching credit so the book still says what happened.
create or replace function public.a_cancelled_episode_returns_the_plan_credit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; v_period date := date_trunc('month', (now() at time zone 'America/New_York'))::date;
begin
  if new.status <> 'cancelled' or old.status is not distinct from 'cancelled' then return new; end if;
  for r in
    select l.profile_id, sum(l.delta_cents) as back
    from public.account_ledger l
    where l.episode_id = new.id and l.kind = 'plan_credit'
      and date_trunc('month', (l.created_at at time zone 'America/New_York'))
          = date_trunc('month', (now() at time zone 'America/New_York'))
    group by l.profile_id
    having sum(l.delta_cents) > 0
  loop
    update public.pass_credits
       set spent_cents = greatest(0, spent_cents - r.back)
     where profile_id = r.profile_id and period = v_period;
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id)
    values (r.profile_id, -r.back, 'plan_credit', 'Membership credit returned — ' || new.title, new.id),
           (r.profile_id,  r.back, 'credit',      'Cancelled — plan credit restored: ' || new.title, new.id);
  end loop;
  return new;
end $function$;

revoke all on function public.a_cancelled_episode_returns_the_plan_credit() from public, anon, authenticated;

drop trigger if exists a_cancelled_episode_returns_the_plan_credit on public.episodes;
create trigger a_cancelled_episode_returns_the_plan_credit
  after update of status on public.episodes
  for each row execute function public.a_cancelled_episode_returns_the_plan_credit();;
