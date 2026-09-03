-- The only thing a rota is actually for. Not a calendar to admire — a list that
-- says which nights are short and how soon they are.
--
-- security_invoker so row-level security still applies to whoever selects it: a
-- view that ran as its owner would hand the whole rota to anyone with the grant,
-- which is the classic way a view becomes a hole. crew_needs has no anon policy,
-- so a signed-out reader resolves every headcount to zero and the view is empty
-- for them by construction rather than by a filter somebody has to remember.
create or replace view public.episode_crew_gaps
with (security_invoker = true) as
with ep as (
  select id, slug, title, starts_at, setting,
         /* Legacy sky-class rows read as ashore, the same way the manifest
            reads them. */
         case when setting = 'sea' then 'sea' else 'shore' end as need_setting
  from public.episodes
  where status in ('scheduled', 'live', 'weather_hold')
    and starts_at >= now() - interval '1 day'
),
wanted as (
  select ep.id as episode_id, ep.slug, ep.title, ep.starts_at, ep.setting,
         pos.slug as position_slug,
         /* The episode's own number wins, the setting's default stands in, and
            an explicit zero is how a night says it does not want a position its
            setting normally has. */
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
  /* Only a confirmation counts against a need. An offer nobody answered is not
     cover, and forty-eight hours out it is the thing to chase. */
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
