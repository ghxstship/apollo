/* Two free-form writers that the spec bounds and the database didn't.

   1. operations.md fixes the vessel at forty passengers and names the two
      lawful compositions; setTheComposition accepted any caps 0-96. The
      composition console stays free (the club may gate however it likes),
      but the HEADS may never exceed the hull: a couple cap counts two.

   2. Crew ATS wrote stage transitions raw — applied -> offer in one write,
      offer -> applied in another. The pipeline is now a ladder: forward one
      rung at a time, 'passed' (passed over) reachable from anywhere, and
      nothing moves backward — the same discipline vetting's decline already
      has. */

create or replace function public.the_hull_holds_forty()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
declare heads int;
begin
  select coalesce(sum(case when segment = 'couple' then cap * 2 else cap end), 0)
    into heads
  from public.voyage_segment_caps
  where voyage_id = new.voyage_id;
  if heads > 40 then
    raise exception 'the hull holds forty — this composition seats % heads', heads;
  end if;
  return new;
end $fn$;

drop trigger if exists the_hull_holds_forty on public.voyage_segment_caps;
create constraint trigger the_hull_holds_forty
  after insert or update on public.voyage_segment_caps
  deferrable initially deferred
  for each row execute function public.the_hull_holds_forty();

create or replace function public.a_stage_is_earned_in_order()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if new.stage = old.stage then return new; end if;
  if new.stage = 'passed' then return new; end if;
  if not (
    (old.stage = 'applied'   and new.stage = 'interview') or
    (old.stage = 'interview' and new.stage = 'sea_trial') or
    (old.stage = 'sea_trial' and new.stage = 'offer')
  ) then
    raise exception 'the pipeline runs applied, interview, sea trial, offer — % does not follow %', new.stage, old.stage;
  end if;
  return new;
end $fn$;

drop trigger if exists a_stage_is_earned_in_order on public.crew_candidates;
create trigger a_stage_is_earned_in_order
  before update of stage on public.crew_candidates
  for each row execute function public.a_stage_is_earned_in_order();;
