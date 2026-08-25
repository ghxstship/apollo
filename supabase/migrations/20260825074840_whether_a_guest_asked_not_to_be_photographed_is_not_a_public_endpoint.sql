-- blur_is_required(uuid) was reachable from the open water. It is SECURITY
-- DEFINER, it takes a profile id, and it reads preference_boundaries and
-- profiles past row-level security — so anyone at all could POST
-- /rest/v1/rpc/blur_is_required with a member's uuid and learn whether that
-- member has asked never to be photographed.
--
-- That is a Preference Sheet answer. The kit's rule on those is not soft: the
-- boundaries panel says answers are "never surfaced in Radar, never shown to
-- another guest", and this is the most sensitive of the three — it is the
-- consent flag the Confessional Pod reads. RLS on preference_boundaries was
-- correct all along and this function walked straight past it, because the
-- project's default privileges grant EXECUTE on every new function to anon and
-- authenticated, and the earlier migration revoked only from PUBLIC, which does
-- not touch a grant a role holds in its own name.
--
-- Revoked from BOTH API roles, not only from anon. A signed-in member asking
-- about another member is the exact thing the rule forbids, and there is no
-- caller that needs it: the ratchet in a_pod_session_keeps_its_blur runs inside
-- a trigger as the definer, and the crew surface reads the resulting
-- pod_sessions.blur_required column rather than the question behind it.
revoke execute on function public.blur_is_required(uuid) from public, anon, authenticated;

-- Same class, smaller blast radius. purge_spent_identity_records() raises
-- 'staff only' on its first line, so a stranger calling it got a refusal rather
-- than a retention sweep — but a signed-out caller should not be able to reach a
-- definer function that deletes identity records at all, and the refusal was the
-- only thing between them and it.
revoke execute on function public.purge_spent_identity_records() from anon;

-- ── And one member-facing sentence with two spaces in it ───────────────────
-- 'your clearance lapsed on %  — the vetting team reopens it' renders a double
-- space before the dash, because the format placeholder was written as if it
-- needed padding. This message is read by a member at a checkout at the moment
-- they are refused a seat; it is not the place for a typographic seam.
--
-- Rewritten from the function's own pg_get_functiondef rather than retyped, and
-- checked that the replacement landed — hand-copying a function body to change
-- one string is how a line gets dropped out of a trigger.
do $$
declare src text; fixed text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'guard_the_vetting';

  if src is null then
    raise exception 'guard_the_vetting is gone — the funnel is not being enforced';
  end if;

  fixed := replace(src, 'lapsed on %  — the vetting', 'lapsed on % — the vetting');
  if fixed = src then
    raise notice 'already single-spaced';
  else
    execute fixed;
  end if;
end $$;;
