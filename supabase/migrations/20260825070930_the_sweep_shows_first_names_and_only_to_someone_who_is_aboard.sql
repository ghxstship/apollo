-- The radar sweep. This has to be a definer function and cannot be a policy on
-- `rsvps`: that table is "own passes or staff", and widening it so members can
-- read each other's passes would hand every member the whole manifest of every
-- sailing they are on, with statuses, promo codes and cabin assignments, in
-- order to draw three pins.
--
-- So the manifest stays shut and this returns the four things a pin is: a pass
-- id to plot against, a first name, whether it is a couple, and whether it is
-- already plotted. No distance, no ranking, no bio, no photo, no age -- "you met
-- them today" is the whole file, and there is nowhere in this row for anything
-- else even if a surface wanted it.
create or replace function public.radar_sweep(p_voyage uuid)
returns table (rsvp_id uuid, name text, couple boolean, plotted boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  mine record;
  clock record;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;

  select * into clock from public.voyage_radar where voyage_id = p_voyage;
  if clock.voyage_id is null then raise exception 'radar does not run on this sailing'; end if;

  -- Only aboard, and the gate is on the READ as well as the write. A sweep that
  -- returned pins to someone ashore would be a directory of who is on a boat
  -- right now, which is a different and much worse product than the one the kit
  -- draws -- and it would be reachable by anyone with a lapsed pass.
  select * into mine from public.rsvps
  where voyage_id = p_voyage and profile_id = auth.uid();
  if mine.id is null or mine.status <> 'aboard' or mine.checked_in_at is null then
    raise exception 'radar opens when you are aboard';
  end if;
  if now() < clock.opens_at then
    raise exception 'radar opens at 17:15, on open water';
  end if;

  return query
  select
    r.id,
    -- First names only on guest-facing surfaces; surnames are a crew surface.
    coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'A guest'),
    r.segment = 'couple',
    exists (
      select 1 from public.radar_picks k
      where k.voyage_id = p_voyage and k.picker_rsvp = mine.id and k.picked_rsvp = r.id
    )
  from public.rsvps r
  join public.profiles p on p.id = r.profile_id
  where r.voyage_id = p_voyage
    and r.status = 'aboard'
    and r.checked_in_at is not null
    and r.id <> mine.id
    -- The existing manifest opt-out is honoured. A member who asked not to be
    -- listed and then found themselves a pin on thirty-nine phones would have
    -- had that opt-out quietly overridden by a newer surface, which is how an
    -- opt-out stops meaning anything. The cost is that they cannot be picked,
    -- and the Radar surface says so to their face rather than letting them plot
    -- into a dead end.
    and r.show_on_manifest
    and p.on_manifest
  order by r.created_at;
end $$;

comment on function public.radar_sweep(uuid) is
  'The pins on one sailing, for someone aboard it, inside the radar window. First names only, couples as one pin, and nothing else about anybody.';

revoke all on function public.radar_sweep(uuid) from public, anon;
grant execute on function public.radar_sweep(uuid) to authenticated;;
