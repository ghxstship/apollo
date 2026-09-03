-- The other half of billing. Naming the crew is a reason to book; remembering
-- that you already know them is a reason to come back, and it is the thing the
-- club has that a schedule cannot fake.
--
-- security_invoker, spelled the house way this time, so row-level security does
-- the scoping: passes are readable by the member who holds them, which means
-- this view shows a member their own history and nobody else's without a single
-- filter in the query that reads it.
create or replace view public.member_crew_history
with (security_invoker = on) as
select
  p.profile_id,
  a.crew_id,
  count(*)::int as together,
  max(e.starts_at) as last_together
from public.passes p
join public.episodes e on e.id = p.episode_id
join public.crew_assignments a on a.episode_id = p.episode_id
where p.status = 'aboard'
  and a.status = 'confirmed'
  /* Nights that happened. A pass for next month is not a memory. */
  and e.starts_at < now()
group by p.profile_id, a.crew_id;

grant select on public.member_crew_history to authenticated;;
