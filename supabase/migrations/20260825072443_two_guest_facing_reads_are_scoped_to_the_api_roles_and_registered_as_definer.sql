-- security_report() caught two things in the Vetting and Radar schema. Both are
-- real, and they are fixed in opposite directions: one by tightening the thing
-- that failed, one by registering it.

-- ── 1. The policies, tightened rather than exempted ────────────────────────
-- `to public` on a SELECT policy means every role in the cluster, which is
-- wider than anything PostgREST can present and wider than the two roles that
-- were meant. The invariant exists to catch exactly that, and the honest answer
-- to it is not an entry on the exemption list — it is to name the two roles.
--
-- Both of these reads are genuinely guest-facing and stay readable signed out:
-- the vetting kit's capacity panel is a GUEST surface whose standing rule is
-- that capacity is shown by segment, and the radar countdown has to be read
-- from the same row the lock is enforced against, or the clock on the screen
-- and the refusal from the database will eventually disagree.
drop policy if exists "segment caps are public" on public.voyage_segment_caps;
create policy "segment caps are public" on public.voyage_segment_caps
  for select to anon, authenticated using (true);

drop policy if exists "the radar clock is public" on public.voyage_radar;
create policy "the radar clock is public" on public.voyage_radar
  for select to anon, authenticated using (true);

-- ── 2. The two definer views, registered ───────────────────────────────────
-- `view_security_invoker` carries a hand-kept list of views that are definer on
-- purpose, and that list IS the mechanism: a definer view sees past RLS, so
-- each one is supposed to be a named decision somebody signed off rather than a
-- default nobody noticed. Neither of these can be an invoker view:
--
--   voyage_segment_capacity aggregates `rsvps`, which is "own passes or staff".
--   As an invoker view a member would count their own single pass and read
--   "1 of 10" on a full sailing — worse than no panel, because it looks right.
--
--   own_vetting_state filters on auth.uid() over `vetting_files`, which is
--   staff-only by design. As an invoker view it returns nothing to the one
--   person it exists to answer.
--
-- Rewritten from the function's own pg_get_functiondef rather than retyped:
-- security_report() is several hundred lines of catalog queries and hand-copying
-- it to add two strings is how a check silently stops running.
--
-- The anchor is the FRONT of the list, not the closing bracket. Another agent is
-- adding views to this same list in this same branch today, and an append that
-- keyed on `'member_affinity')` would find nothing the moment they appended
-- first — leaving a no-op migration and a green build with the check still
-- failing. Prepending to a stable opening token survives either order.
do $$
declare
  src   text;
  fixed text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'security_report';

  if src is null then
    raise exception 'security_report() is gone — the schema invariants are not running at all';
  end if;

  if src like '%voyage_segment_capacity%' then
    raise notice 'already registered';
    return;
  end if;

  fixed := replace(
    src,
    'c.relname in (''voyage_capacity'',',
    'c.relname in (''voyage_segment_capacity'', ''own_vetting_state'', ''voyage_capacity'','
  );

  if fixed = src then
    raise exception 'the definer-view allow-list did not match its anchor — security_report() has been restructured and this needs re-reading, not re-running';
  end if;

  execute fixed;
end $$;;
