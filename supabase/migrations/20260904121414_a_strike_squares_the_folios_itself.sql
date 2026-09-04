-- The previous version cancelled the episode from inside its own BEFORE
-- DELETE trigger, which Postgres refuses (27000: a row cannot be updated by a
-- trigger that is deleting it). So the guard does the squaring itself, with
-- the same rules the cancellation follows: every member charged on the
-- episode is credited what they are owed, a plan credit spent this month
-- comes back, installments stop, and everyone holding or queued for a pass
-- gets the word. The knots are returned by the trigger beside this one.
-- A completed episode keeps its book — the money was earned — and is struck
-- as before.
create or replace function public.an_episode_inside_the_window_is_cancelled_not_struck()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r record;
  v_period date := date_trunc('month', (now() at time zone 'America/New_York'))::date;
begin
  if old.status not in ('scheduled', 'live', 'weather_hold')
     or not exists (select 1 from public.passes x where x.episode_id = old.id and x.status = 'aboard') then
    return old;
  end if;

  update public.installment_plans ip
     set status = 'cancelled', next_charge_at = null
    from public.passes rv
   where rv.id = ip.rsvp_id and rv.episode_id = old.id and ip.status = 'active';

  /* This month's plan credit comes back first, so the cash figure below is
     computed after it — the same order the release keeps. */
  for r in
    select l.profile_id, sum(l.delta_cents) as back
      from public.account_ledger l
     where l.episode_id = old.id and l.kind = 'plan_credit'
       and date_trunc('month', (l.created_at at time zone 'America/New_York'))
           = date_trunc('month', (now() at time zone 'America/New_York'))
     group by l.profile_id
    having sum(l.delta_cents) > 0
  loop
    update public.pass_credits
       set spent_cents = greatest(0, spent_cents - r.back)
     where profile_id = r.profile_id and period = v_period;
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id)
    values (r.profile_id, -r.back, 'plan_credit', 'Membership credit returned — ' || old.title, old.id);
  end loop;

  for r in
    select l.profile_id, coalesce(-sum(l.delta_cents), 0) as owed
      from public.account_ledger l
     where l.episode_id = old.id
     group by l.profile_id
    having coalesce(-sum(l.delta_cents), 0) > 0
  loop
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id)
    values (r.profile_id, r.owed, 'credit', 'Struck — full credit: ' || old.title, old.id);
  end loop;

  insert into public.notifications (profile_id, kind, title, body)
  select rv.profile_id, 'manifest', 'Struck: ' || old.title,
         'The club took it off the manifest. Your account is credited in full — no games, no forms.'
    from public.passes rv
   where rv.episode_id = old.id and rv.status in ('aboard', 'waitlist');

  return old;
end $function$;;
