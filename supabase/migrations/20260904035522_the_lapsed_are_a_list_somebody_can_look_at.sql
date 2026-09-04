-- A lapse is recoverable revenue and nothing in the Bridge has ever listed one.
-- Reports counts churn as a number; this is the four people behind it, with how
-- long they have been gone and whether anyone has written to them.
--
-- Deliberately a view rather than a page-local query: the same list answers
-- "who should we call" and "did the weekly letter actually go", and those are
-- asked from different places.
create or replace view public.lapsed_members
with (security_invoker = on) as
select
  p.id as profile_id,
  p.full_name,
  p.email,
  p.tier,
  mp.started_at as held_since,
  (extract(epoch from (now() - mp.started_at)) / 86400)::int as days_held,
  pl.label as plan_label,
  pl.price_cents as was_paying_cents,
  coalesce((select sum(k.delta) from public.knots_ledger k where k.profile_id = p.id), 0)::int as knots,
  exists (
    select 1 from public.email_outbox o
    where lower(o.to_email) = lower(coalesce(p.email, '')) and o.template = 'win-back'
  ) as written_to
from public.profiles p
join public.membership_pauses mp on mp.profile_id = p.id and mp.ended_at is null
left join public.membership_plans pl on pl.id = p.plan_id
/* A lapse, not a pause: the club stopped the membership because the card
   stopped, which is a different person from one who asked for a break. */
where p.status = 'paused' and p.hold_reason = 'dues';

grant select on public.lapsed_members to authenticated;

comment on view public.lapsed_members is
  'Memberships held because dues stopped clearing — involuntary, and recoverable. Distinct from a member''s own pause, which carries no hold_reason, and from a departure, which was a decision.';;
