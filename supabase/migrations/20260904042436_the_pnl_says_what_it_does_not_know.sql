-- Per-episode P&L, and the column that makes it honest is `costed`.
--
-- An episode with no expenses recorded has a cost of zero, and zero cost makes
-- a margin of one hundred per cent. Rendered in a table next to real revenue
-- that reads as a fact, and it is the single most misleading number this
-- schema could produce. So the view says whether anybody has actually costed
-- the night, and the surface refuses to draw a margin where nobody has.
--
-- Revenue is what was charged for the episode net of credits — the ledger, not
-- the price list, so a comp is worth nothing and a discount is worth what it
-- was actually sold for. Membership credit counts as revenue: the club was paid
-- for it in dues, and a night bought with it is not a night given away.
create or replace view public.episode_pnl
with (security_invoker = on) as
select
  e.id as episode_id,
  e.slug,
  e.title,
  e.starts_at,
  e.setting,
  e.series,
  coalesce(rev.revenue_cents, 0)::int as revenue_cents,
  coalesce(cost.cost_cents, 0)::int as cost_cents,
  coalesce(cost.unsettled_cents, 0)::int as unsettled_cents,
  (coalesce(rev.revenue_cents, 0) - coalesce(cost.cost_cents, 0))::int as margin_cents,
  /* The honest bit. False means nobody has said what this night cost — so the
     margin above is revenue wearing a margin's name, and must not be shown as
     one. */
  coalesce(cost.lines, 0) > 0 as costed
from public.episodes e
left join lateral (
  select sum(
           case when l.delta_cents < 0 and l.kind in ('pass','deposit','addon','galley')
                then -l.delta_cents
                when l.kind in ('credit') then -l.delta_cents
                else 0 end
         ) as revenue_cents
  from public.account_ledger l
  where l.episode_id = e.id
) rev on true
left join lateral (
  select sum(x.amount_cents) as cost_cents,
         sum(x.amount_cents) filter (where not x.settled) as unsettled_cents,
         count(*) as lines
  from public.episode_expenses x
  where x.episode_id = e.id
) cost on true;

grant select on public.episode_pnl to authenticated;

comment on view public.episode_pnl is
  'Revenue and cost per episode. `costed` says whether anybody has recorded a cost at all — an uncosted night has a zero cost and therefore a hundred per cent margin, which is the most misleading number this schema can produce. Do not render a margin where costed is false.';;
