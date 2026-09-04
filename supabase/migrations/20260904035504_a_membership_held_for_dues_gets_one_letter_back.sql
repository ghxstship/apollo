-- NO NEW STATUS VALUE, and that is the finding rather than a shortcut.
--
-- The survey said there is no lapsed state and profiles.status should gain a
-- fourth value. The enum has three, but the MODEL already has four, because
-- handle_subscription_status writes a lapse as paused + hold_reason 'dues' +
-- status_set_by null. So the club can already tell apart:
--
--   paused, hold_reason null, set by self   a member's own pause
--   paused, hold_reason dues                a lapse — the card stopped
--   paused, hold_reason conduct or club     a hold the club placed
--   departed                                a member who chose to leave
--
-- Adding 'lapsed' would restate the second of those in a second place, and
-- every consumer of status would have to learn it for no new information. The
-- distinction that matters — did they choose to go, or did a card fail — is
-- already recorded and already queryable.
--
-- What is genuinely missing is that NOTHING EVER FOLLOWS. The hold notice goes
-- out once, and then the club's position is "we stopped charging you and never
-- mentioned it again". This is the letter after the silence.

insert into public.email_templates (code, description, active) values
  ('win-back', 'A membership held for dues, one letter later. The place is still there.', true)
on conflict (code) do update set description = excluded.description, active = true;

create or replace function public.write_to_the_long_held()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare n integer;
begin
  with held as (
    select p.id, p.email, p.full_name,
           coalesce((select sum(k.delta) from public.knots_ledger k where k.profile_id = p.id), 0) as knots
    from public.profiles p
    join public.membership_pauses mp
      on mp.profile_id = p.id and mp.ended_at is null
    where p.status = 'paused'
      and p.hold_reason = 'dues'
      and p.email is not null
      /* Long enough that dunning has finished and this is not a fourth chase.
         The dues-failed sequence works the first weeks; this is for after. */
      and mp.started_at < now() - interval '45 days'
      /* Asked once. A win-back that repeats is not a win-back, it is a
         nuisance, and the letter itself offers the way to stop it. */
      and not exists (
        select 1 from public.email_outbox o
        where lower(o.to_email) = lower(p.email) and o.template = 'win-back'
      )
  )
  insert into public.email_outbox (to_email, template, payload)
  select held.email, 'win-back',
         jsonb_build_object('name', held.full_name,
                            'knots', case when held.knots > 0 then held.knots::text else null end)
  from held;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.write_to_the_long_held() from public, anon, authenticated;

select cron.schedule(
  'win-back-weekly',
  /* Weekly, and on a Tuesday morning rather than a Monday: the point is to be
     read, and this is not urgent enough to earn the top of anybody's week. */
  '0 14 * * 2',
  $$select public.write_to_the_long_held()$$
);;
