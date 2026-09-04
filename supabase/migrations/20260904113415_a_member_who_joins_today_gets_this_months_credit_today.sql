-- A member who joined on the 5th paid a full month of dues and received nothing
-- until the 1st. grant_monthly_pass_credit() runs once a month for everyone,
-- and nothing granted a credit when a plan was taken or changed — twenty-six
-- days of dues with no allowance, on every signup that was not on the 1st.
-- The exact mirror of the liability the draw-down was written to close.
--
-- The rule: when a profile becomes active on a plan that carries a credit, or
-- moves to one, the current calendar month's credit is granted in full. Not
-- pro-rated. Stripe charges the whole first period on the join date, so the
-- member has paid for a month and gets a month; the calendar period means the
-- club is, if anything, generous to a late-month joiner, and generous is the
-- right side to err on for a first impression. Pro-rata is a one-line change
-- to granted_cents below if the owner wants it.
--
-- Monotonic. A change of plan mid-month raises the grant to the new plan's
-- figure and never lowers it: spent_cents may already exceed a lower figure,
-- and a credit once shown to a member is not taken back by a change of plan.

create or replace function public.grant_pass_credit_for(p_profile_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare granted integer;
begin
  insert into public.pass_credits (profile_id, period, plan_id, granted_cents)
  select p.id,
         date_trunc('month', (now() at time zone 'America/New_York'))::date,
         p.plan_id,
         m.monthly_credit_cents
    from public.profiles p
    join public.membership_plans m on m.id = p.plan_id
   where p.id = p_profile_id
     and p.status = 'active'
     and m.active
     and m.monthly_credit_cents > 0
  on conflict (profile_id, period) do update
     set granted_cents = excluded.granted_cents,
         plan_id = excluded.plan_id
   where pass_credits.granted_cents < excluded.granted_cents;
  get diagnostics granted = row_count;
  return granted;
end $function$;

revoke all on function public.grant_pass_credit_for(uuid) from public, anon, authenticated;

-- Fires off the profile rather than the subscription, because the profile is
-- where the plan lands: handle_subscription_status copies plan_id there when a
-- subscription goes active, and Shoreside can set it by hand. Either route ends
-- here.
create or replace function public.credit_follows_the_plan()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'active' and new.plan_id is not null
     and (tg_op = 'INSERT'
          or old.plan_id is distinct from new.plan_id
          or old.status is distinct from new.status) then
    perform public.grant_pass_credit_for(new.id);
  end if;
  return new;
end $function$;

revoke all on function public.credit_follows_the_plan() from public, anon, authenticated;

drop trigger if exists credit_follows_the_plan on public.profiles;
create trigger credit_follows_the_plan
  after insert or update of plan_id, status on public.profiles
  for each row execute function public.credit_follows_the_plan();

-- Everyone already active on a credited plan this month who has no row yet —
-- the members this bug has been silently shorting since the 1st.
select public.grant_monthly_pass_credit();;
