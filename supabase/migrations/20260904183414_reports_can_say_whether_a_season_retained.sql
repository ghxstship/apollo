-- Churn as named people is good; whether Season I retained is a cohort
-- question, and the owner is opening a second city on the answer. Three
-- views: who joined when and where they stand now, the application funnel,
-- and what each member has paid — staff-scoped by the tables they read.
create or replace view public.membership_cohorts
with (security_invoker = on) as
select date_trunc('month', p.joined_at)::date as cohort,
       count(*) as joined,
       count(*) filter (where p.status = 'active') as active_now,
       count(*) filter (where p.status = 'paused' and p.hold_reason = 'dues') as lapsed,
       count(*) filter (where p.status = 'paused' and p.hold_reason is distinct from 'dues') as paused,
       count(*) filter (where p.status = 'departed') as departed
  from public.profiles p
 where p.joined_at is not null
 group by 1;
grant select on public.membership_cohorts to authenticated;

create or replace view public.application_funnel
with (security_invoker = on) as
select a.status::text as stage, count(*) as applicants,
       count(*) filter (where a.created_at >= date_trunc('year', now())) as this_year
  from public.applications a
 group by 1;
grant select on public.application_funnel to authenticated;

create or replace view public.member_value
with (security_invoker = on) as
select l.profile_id,
       coalesce(sum(-l.delta_cents) filter (where l.kind = 'dues'), 0) as dues_cents,
       coalesce(sum(-l.delta_cents) filter (where l.kind in ('pass','deposit','addon','galley','shop')), 0) as spend_cents,
       min(l.created_at) as first_charge,
       max(l.created_at) as last_charge
  from public.account_ledger l
 where l.delta_cents < 0 and l.profile_id is not null
 group by 1;
grant select on public.member_value to authenticated;;
