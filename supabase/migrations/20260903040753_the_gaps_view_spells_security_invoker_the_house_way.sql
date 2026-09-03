-- The view_security_invoker invariant refused episode_crew_gaps, and the detail
-- it printed was simply "true".
--
-- The view WAS security-invoker. It was created `with (security_invoker = true)`
-- and Postgres stored the reloption verbatim as the string 'true'; the check
-- compares against 'on'. Both spellings are accepted by Postgres and mean the
-- same thing, so this was a real failure of a real rule caught on a technicality
-- of spelling — the semantics were right the whole time.
--
-- Recreating it with the house spelling rather than widening the check: this is
-- a security invariant, and loosening one to accommodate a new view is the wrong
-- direction of fix even when the new view is innocent. The check's narrowness is
-- worth revisiting on its own, deliberately, and not as a side effect of
-- shipping a rota. Every other view in this schema says 'on'.
drop view if exists public.episode_crew_gaps;

create view public.episode_crew_gaps
with (security_invoker = on) as
with ep as (
  select id, slug, title, starts_at, setting,
         case when setting = 'sea' then 'sea' else 'shore' end as need_setting
  from public.episodes
  where status in ('scheduled', 'live', 'weather_hold')
    and starts_at >= now() - interval '1 day'
),
wanted as (
  select ep.id as episode_id, ep.slug, ep.title, ep.starts_at, ep.setting,
         pos.slug as position_slug,
         coalesce(o.headcount, d.headcount, 0) as headcount
  from ep
  cross join public.crew_positions pos
  left join public.crew_needs d
    on d.setting = ep.need_setting and d.position_slug = pos.slug
  left join public.episode_crew_needs o
    on o.episode_id = ep.id and o.position_slug = pos.slug
)
select
  w.episode_id, w.slug, w.title, w.starts_at, w.setting,
  w.position_slug, p.label as position_label, p.position as position_order,
  w.headcount as needed,
  count(a.id) filter (where a.status = 'confirmed')::int as confirmed,
  count(a.id) filter (where a.status = 'offered')::int as offered,
  greatest(w.headcount - count(a.id) filter (where a.status = 'confirmed'), 0)::int as short
from wanted w
join public.crew_positions p on p.slug = w.position_slug
left join public.crew_assignments a
  on a.episode_id = w.episode_id
 and a.position_slug = w.position_slug
 and a.status in ('confirmed', 'offered')
where w.headcount > 0
group by w.episode_id, w.slug, w.title, w.starts_at, w.setting,
         w.position_slug, p.label, p.position, w.headcount;

grant select on public.episode_crew_gaps to authenticated;;
