-- The manifest consent promised something narrower than the club does, and a
-- function written yesterday was readable by anybody signed in.
--
-- Both found by reviewing every SECURITY DEFINER function reachable by anon or
-- authenticated — 125 of them, 11 with no visible check on who is asking. Nine
-- of the eleven are correct: a code IS the authorization (apply_with_invite,
-- validate_invite, check_promo), or the answer is public reference data
-- (passes_left, segment_heads, sponsor_credits, published_version,
-- episode_serves_alcohol). invite_season leaks a weak inference about a
-- member's home city through an ordering clause and is accepted as such.
--
-- ── 1. The words were wrong, not the code ───────────────────────────────────
--
-- episode_manifest() lets any active member read the manifest of any episode.
-- That is deliberate and its own comment says so: "Consent is the gate here,
-- not ownership; show_on_manifest is the member saying yes." A member browsing
-- an episode seeing who is going is the draw, and both consent switches are
-- honoured — an opted-out member is not in the list at all.
--
-- The consent TEXT written yesterday said something else: "your name appears
-- on the manifest of episodes you hold a pass on, where other members aboard
-- that night can read it." Aboard that night. The code says any member.
--
-- So the promise was narrower than the practice, which is the worse direction
-- to be wrong in — a consent recorded against a description of something
-- smaller than what happens is a consent that was not informed. Correcting the
-- code instead would have removed a feature to match a sentence written by
-- somebody who had not read the function.
--
-- Version 2, because consent_texts is append-only and this is exactly what
-- that is for: the wording changes, the old wording stays readable, and every
-- record keeps a copy of the words its member actually saw. No manifest
-- consent has been recorded yet, so nothing points at version 1 — but the
-- mechanism would have held if something had.

insert into public.consent_texts (subject, version, body) values
  ('manifest', 2,
   'You agree that your name and avatar appear on the manifest of episodes you hold a pass on, where any signed-in member can read it — including members who are not aboard that night, because the manifest is part of how people decide to come. Guests you bring are counted but not named. Turning this off takes your name off every manifest; the count of heads remains.')
on conflict (subject, version) do nothing;

comment on table public.consent_texts is
  'The words a member is shown when a consent is asked for, versioned. Append-only: to change the wording, publish a new version. Never edit a row -- somebody agreed to what it said. The manifest text reached version 2 on 2026-09-07 because version 1 described a narrower disclosure than episode_manifest() actually makes, which is the direction of error that matters: a consent given against a description of something smaller than what happens was not an informed one.';

-- ── 2. A dial nobody needs to read ──────────────────────────────────────────
--
-- quiet_until() was granted to authenticated when it was written yesterday,
-- out of habit rather than need. It takes a profile id and returns when that
-- member's quiet hours end, which discloses their timezone and the window they
-- chose to any member who asks.
--
-- Nothing in the application calls it. Its only caller is hold_until_morning(),
-- a trigger that runs as definer and does not need the grant. So the grant is
-- removed rather than the function scoped: a function nobody calls does not
-- need a narrower rule, it needs to stop being reachable.

revoke execute on function public.quiet_until(uuid) from authenticated;

comment on function public.quiet_until(uuid) is
  'When this member''s quiet hours end, or NULL if it is not quiet where they are. Read in the member''s own timezone, falling back to the club''s. Reachable only by the service role and by the trigger that defers a message -- it was granted to authenticated when it was written, which would have let any member read any other member''s timezone and chosen window, and nothing ever called it that way.';

notify pgrst, 'reload schema';
