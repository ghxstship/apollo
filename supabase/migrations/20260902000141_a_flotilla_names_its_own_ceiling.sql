-- DECISION: the hull ceiling is the club's default and a sailing's to override.
-- A tentpole across several hulls states its certified heads on the row, and
-- the composition gate reads that instead of the club setting. The ratio gate
-- itself is unchanged: the composition still seats by segment, the ceiling is
-- simply the flotilla's, not one pontoon's.
alter table public.voyages add column if not exists hull_ceiling_heads integer
  check (hull_ceiling_heads is null or (hull_ceiling_heads between 1 and 400));

create or replace function public.the_hull_holds_forty()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare heads int; ceiling int;
begin
  select coalesce(v.hull_ceiling_heads, public.club_setting('hull_ceiling_heads')) into ceiling
  from public.voyages v where v.id = new.voyage_id;
  ceiling := coalesce(ceiling, public.club_setting('hull_ceiling_heads'));
  select coalesce(sum(cap * public.segment_heads(segment)), 0)
    into heads
  from public.voyage_segment_caps
  where voyage_id = new.voyage_id;
  if heads > ceiling then
    raise exception 'the hull holds % — this composition seats % heads', ceiling, heads;
  end if;
  return new;
end $$;;
