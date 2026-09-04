-- Three dunning letters were registered on the 3rd and one of them had a
-- sender: dues-failed fires from the subscriptions trigger, once, on the day
-- the card declines. card-expiring and final-notice had bodies and nothing
-- that would ever queue them. And there was no ladder — a dunning sequence is
-- a timed set of steps that stops the moment the money arrives, and the
-- automations table fires one action per event with no delay and no memory.
--
-- The ladder. A lapse begins when a subscription goes past_due and ends when
-- it leaves that state; every rung is keyed on the lapse it belongs to, so a
-- member whose card fails again next spring gets the sequence again, and one
-- whose card clears on day 3 never hears rung two. The last rung names the
-- date, and the date is kept: at the end of the grace the club places the
-- dues hold itself rather than waiting for Stripe to give up on a schedule
-- this club does not control. Paying lifts it, as it always has.
--
-- The expiring card is the other half — the letter that prevents the lapse.

insert into public.club_settings (key, value_int, note)
values ('dues_grace_days', 21, 'Days a subscription may sit past_due before the club holds the membership for dues. The final notice names this date.')
on conflict (key) do nothing;

alter table public.subscriptions
  add column if not exists past_due_since timestamptz;

comment on column public.subscriptions.past_due_since is
  'When the current lapse began. Null unless status is past_due. The dunning ladder is keyed on it.';

create or replace function public.a_lapse_has_a_start()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'past_due' then
    if tg_op = 'INSERT' or old.status is distinct from 'past_due' then
      new.past_due_since := now();
    end if;
  else
    new.past_due_since := null;
  end if;
  return new;
end $function$;

revoke all on function public.a_lapse_has_a_start() from public, anon, authenticated;

drop trigger if exists a_lapse_has_a_start on public.subscriptions;
create trigger a_lapse_has_a_start
  before insert or update of status on public.subscriptions
  for each row execute function public.a_lapse_has_a_start();

update public.subscriptions set past_due_since = coalesce(updated_at, now())
 where status = 'past_due' and past_due_since is null;

create table if not exists public.dunning_steps (
  step       integer primary key,
  day_offset integer not null check (day_offset >= 0),
  template   text not null references public.email_templates(code)
);

comment on table public.dunning_steps is
  'The ladder: which letter goes out how many days into a lapse. Rung three is written three days before the grace ends; change dues_grace_days and move it.';

insert into public.dunning_steps (step, day_offset, template) values
  (1, 0,  'dues-failed'),
  (2, 7,  'dues-failed'),
  (3, 18, 'final-notice')
on conflict (step) do nothing;

alter table public.dunning_steps enable row level security;
create policy "the bridge reads the ladder" on public.dunning_steps
  for select to authenticated using (public.is_staff());
grant select on public.dunning_steps to authenticated;

create table if not exists public.dunning_log (
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  lapse_started   timestamptz not null,
  step            integer not null references public.dunning_steps(step),
  sent_at         timestamptz not null default now(),
  primary key (subscription_id, lapse_started, step)
);
alter table public.dunning_log enable row level security;
create policy "the bridge reads what was sent" on public.dunning_log
  for select to authenticated using (public.is_staff());
grant select on public.dunning_log to authenticated;

create table if not exists public.card_notices (
  payment_method_id uuid not null references public.payment_methods(id) on delete cascade,
  exp_year  integer not null,
  exp_month integer not null,
  sent_at   timestamptz not null default now(),
  primary key (payment_method_id, exp_year, exp_month)
);
alter table public.card_notices enable row level security;

create or replace function public.run_dunning()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s record;
  st record;
  pm record;
  sent integer := 0;
  grace integer := coalesce(public.club_setting('dues_grace_days'), 21);
  holds_on date;
begin
  /* The ladder, one lapse at a time. */
  for s in
    select sub.id, sub.profile_id, sub.past_due_since, p.email, p.full_name, p.status as member_status
      from public.subscriptions sub
      join public.profiles p on p.id = sub.profile_id
     where sub.status = 'past_due'
       and sub.past_due_since is not null
       and p.status <> 'departed'
  loop
    holds_on := (s.past_due_since + make_interval(days => grace))::date;

    for st in
      select * from public.dunning_steps d
       where now() >= s.past_due_since + make_interval(days => d.day_offset)
         and not exists (select 1 from public.dunning_log l
                          where l.subscription_id = s.id and l.lapse_started = s.past_due_since and l.step = d.step)
       order by d.step
    loop
      insert into public.dunning_log (subscription_id, lapse_started, step)
      values (s.id, s.past_due_since, st.step);

      /* Rung one is the letter the subscriptions trigger may already have
         queued through an operator's automation. One letter, not two. */
      if st.step = 1 and exists (
        select 1 from public.email_outbox o
         where o.to_email = s.email and o.template = 'dues-failed'
           and o.created_at >= s.past_due_since - interval '1 hour'
      ) then
        continue;
      end if;

      if s.email is not null then
        insert into public.email_outbox (to_email, template, payload)
        values (s.email, st.template,
                jsonb_build_object('name', s.full_name,
                                   'holds_on', to_char(holds_on, 'FMMonth FMDD')));
        sent := sent + 1;
      end if;
    end loop;

    /* The date the last letter named. */
    if now() >= s.past_due_since + make_interval(days => grace) and s.member_status = 'active' then
      update public.profiles
         set status = 'paused', hold_reason = 'dues', status_set_by = null
       where id = s.profile_id and status = 'active';
      insert into public.notifications (profile_id, kind, title, body)
      values (s.profile_id, 'word', 'Membership held — dues lapsed.',
              'Booking, posting and contests are closed until dues clear. Settle in the portal and the hold lifts on its own; a word to Shoreside does the same.');
    end if;
  end loop;

  /* The card that is about to expire, thirty days out, once per card per
     expiry. Default cards on active memberships only — a card nobody draws
     on can expire in peace. */
  for pm in
    select m.id, m.exp_year, m.exp_month, p.email, p.full_name
      from public.payment_methods m
      join public.profiles p on p.id = m.profile_id
     where m.is_default
       and p.status = 'active'
       and p.email is not null
       and m.exp_year is not null and m.exp_month is not null
       and (make_date(m.exp_year, m.exp_month, 1) + interval '1 month' - interval '1 day')
           between now() and now() + interval '30 days'
       and not exists (select 1 from public.card_notices n
                        where n.payment_method_id = m.id and n.exp_year = m.exp_year and n.exp_month = m.exp_month)
  loop
    insert into public.card_notices (payment_method_id, exp_year, exp_month)
    values (pm.id, pm.exp_year, pm.exp_month);
    insert into public.email_outbox (to_email, template, payload)
    values (pm.email, 'card-expiring',
            jsonb_build_object('name', pm.full_name,
                               'expires', to_char(make_date(pm.exp_year, pm.exp_month, 1), 'FMMonth YYYY')));
    sent := sent + 1;
  end loop;

  return sent;
end $function$;

revoke all on function public.run_dunning() from public, anon, authenticated;

-- Ten in the morning on the club's clock, after the overnight Stripe retries
-- have had their say.
select cron.schedule('dunning-daily', '0 14 * * *', $$select public.run_dunning()$$);;
