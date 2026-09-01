-- Repairing my own regression from a_seat_already_held_is_not_a_seat_being_taken.
--
-- Adding the unsegmented count to voyage_segment_capacity, I rebuilt the view
-- with `security_invoker = on` and granted it to `authenticated` only. Both
-- were wrong, and 20260825071252 had said so explicitly: this view is
-- `security_invoker = off` ON PURPOSE and granted to anon as well.
--
-- The point of it is to answer "how full is this sailing" to someone who is not
-- signed in, WITHOUT telling them who is aboard. It exposes cap, units and
-- remaining — numbers, no identities — and to compute those numbers it has to
-- count rows the reader cannot see. Running as the invoker, anon has no SELECT
-- on rsvps, so every count silently collapsed to nought: a sailing with two
-- couples aboard read as empty, and the ratio gate then refused a sale the page
-- had just advertised as available.
--
-- The e2e suite caught it in one run, on the assertion written for exactly this
-- ("capacity reads by segment and names nobody"), which is the only reason it
-- did not reach anybody.
create or replace view public.voyage_segment_capacity
with (security_invoker = off) as
select c.voyage_id,
       c.segment,
       c.cap,
       coalesce(t.units, 0::bigint) as units,
       greatest(c.cap - coalesce(t.units, 0::bigint), 0::bigint) as remaining,
       -- Aboard passes stating no segment: every pass sold before a sailing was
       -- gated. Left out of `units`, so the crew set their first ceilings
       -- against "0 SOLD" on a boat with people on it. A count, like the rest —
       -- it names nobody.
       coalesce(u.unsegmented, 0::bigint) as unsegmented_aboard
  from public.voyage_segment_caps c
  left join (
    select r.voyage_id, r.segment, count(*) as units
      from public.rsvps r
     where r.status = 'aboard' and r.segment is not null
     group by r.voyage_id, r.segment
  ) t on t.voyage_id = c.voyage_id and t.segment = c.segment
  left join (
    select r.voyage_id, count(*) as unsegmented
      from public.rsvps r
     where r.status = 'aboard' and r.segment is null
     group by r.voyage_id
  ) u on u.voyage_id = c.voyage_id;

grant select on public.voyage_segment_capacity to anon, authenticated;

-- The two properties that must both hold, asserted rather than assumed: it
-- reads as the club (so the counts are true), and it carries no identity.
do $$
declare opts text; cols text;
begin
  select array_to_string(reloptions, ',') into opts
    from pg_class where relname = 'voyage_segment_capacity';
  if coalesce(opts, '') like '%security_invoker=on%' then
    raise exception 'the capacity view must read as the club or its counts collapse for anon';
  end if;

  select string_agg(attname, ',') into cols from pg_attribute
   where attrelid = 'public.voyage_segment_capacity'::regclass and attnum > 0 and not attisdropped;
  if cols ~ 'profile|name|email|rsvp_id' then
    raise exception 'the capacity view names somebody: %', cols;
  end if;

  if not has_table_privilege('anon', 'public.voyage_segment_capacity', 'select') then
    raise exception 'anon can no longer read how full a sailing is';
  end if;
end $$;;
