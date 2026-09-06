-- Three invariants the last pass broke, and one of them would have taken the
-- door down on the first real night.
--
-- ── 1. The age gate refused everybody ───────────────────────────────────────
--
-- nobody_boards_a_night_with_a_bar_without_saying_they_are_of_age added
-- pass_guests.of_age and a trigger refusing to check in a guest who had not
-- attested. Two things about that were wrong together.
--
-- episode_serves_alcohol() reads the galley, which is one list for the whole
-- club rather than one per episode -- so EVERY night counts as a night with a
-- bar. And nothing anywhere asks the question, so of_age is null for every
-- guest who exists and every guest who will be created tomorrow. The result:
-- the trigger refused every check-in on every episode. The suite caught it four
-- times over, which is what a suite is for.
--
-- The fix is not to ask a new question. The club already collects the answer
-- and has since the waiver was written: signatures.guardian_name. A guest who
-- signs for themselves names no guardian; a guest who needs a guardian to sign
-- for them is a minor, and that is the entire reason the column exists. Reading
-- it is more honest than a fresh checkbox would be, because it is the answer
-- somebody actually gave under a signature rather than a box they clicked past.
--
-- So the rule, in order:
--   of_age = true   -- somebody asked and they said yes. Board.
--   of_age = false  -- somebody asked and they said no. Refused.
--   of_age is null  -- nobody asked directly, so read the signature: a waiver
--                      naming a guardian is a minor and is refused; a waiver
--                      signed for oneself is an adult and boards.
--
-- The column stays for the day the waiver asks outright, and it wins when it
-- is set. Until then the signature answers, which means nothing has to be
-- backfilled and no guest is refused for a question the club never put to them.

create or replace function public.a_guest_says_they_are_of_age()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_episode uuid;
  v_min integer := coalesce(public.club_setting('guest_minimum_age'), 21);
begin
  /* Only at the moment of boarding. A guest may be named, and their waiver
     sent, long before anybody knows whether they will come. */
  if new.checked_in_at is null or old.checked_in_at is not null then
    return new;
  end if;

  select r.episode_id into v_episode from public.passes r where r.id = new.rsvp_id;
  if v_episode is null or not public.episode_serves_alcohol(v_episode) then
    return new;
  end if;

  /* Asked outright, and they said yes. */
  if new.of_age is true then
    return new;
  end if;

  /* Asked outright, and they said no. */
  if new.of_age is false then
    raise exception 'there is a bar tonight and this guest is under %', v_min
      using errcode = '53400';
  end if;

  /* Nobody asked outright, so read what they signed. A waiver naming a
     guardian is a minor's waiver -- that is what the field is for -- and a
     guest who has signed nothing at all is already refused by
     require_guest_signature_at_check_in, which runs beside this one. */
  if exists (
    select 1 from public.signatures s
     where s.guest_id = new.id
       and s.redacted_at is null
       and nullif(btrim(coalesce(s.guardian_name, '')), '') is not null
  ) then
    raise exception 'there is a bar tonight, and this waiver was signed by a guardian — a guest under % cannot board it', v_min
      using errcode = '53400';
  end if;

  return new;
end $fn$;

revoke all on function public.a_guest_says_they_are_of_age() from public, anon, authenticated;

comment on function public.a_guest_says_they_are_of_age() is
  'Refuses to board a minor on a night that serves alcohol. Reads pass_guests.of_age when somebody asked outright, and otherwise falls back to the guardian named on the waiver they signed -- which is the answer the club already collects and the reason that field exists. Fires at check-in, not when a guest is named, so a member can still add a guest before that guest has answered anything.';

-- ── 2. Two tables with row security and no policy ───────────────────────────
--
-- recovery_codes and unsubscribe_links both hold credentials, and both were
-- given RLS with no policy at all on the reasoning that there is nothing on
-- them anybody may read. The has_policy invariant disagreed, and it is right
-- to: a table with row security on and no policy is indistinguishable from one
-- where somebody forgot to write the policy, and "we meant it" is not
-- something the next reader can check.
--
-- Said out loud instead. A policy that permits nothing is the same closed door
-- and it is a door somebody chose to shut.

drop policy if exists "nobody reads a recovery code" on public.recovery_codes;
create policy "nobody reads a recovery code" on public.recovery_codes
  for select to authenticated using (false);

comment on table public.recovery_codes is
  'Single-use codes that let a member who has lost their authenticator prove they are themselves well enough to have the factor removed. Only the SHA-256 of each code is here -- they are shown once and the club cannot show them again. The policy permits nothing on purpose: no member and no operator reads this table, and how many remain is answered by recovery_codes_left() rather than by reading rows.';

drop policy if exists "nobody reads an unsubscribe token" on public.unsubscribe_links;
create policy "nobody reads an unsubscribe token" on public.unsubscribe_links
  for select to authenticated using (false);

comment on table public.unsubscribe_links is
  'One opaque token per address, so a marketing letter can carry a List-Unsubscribe that works without signing in. The policy permits nothing on purpose: holding a token IS the authority it carries, so a table anyone could read would be a table anyone could unsubscribe the whole roster from. Both functions that touch it are definer and reached only by the service role.';

-- ── 3. Two views that had not declared themselves ───────────────────────────
--
-- retention_schedule reads no table at all -- it is a list of dial names -- so
-- it should be an invoker view like every other view that does not need to see
-- past a policy. It simply was not declared, and NOT SET is exactly the state
-- the invariant exists to catch.

/* `on`, not `true`. Postgres stores the reloption verbatim and the invariant
   compares it to the string 'on' -- which every other view in this schema is
   set to, and which two views written yesterday were not. They type-checked,
   replayed and worked; they simply did not answer the question the way the
   check asks it. */
alter view public.retention_schedule set (security_invoker = on);
alter view public.current_consent  set (security_invoker = on);

-- my_account_history is deliberately a definer view and belongs on the list of
-- them. It runs as its owner to see past "the bridge reads the log" on
-- audit_log -- a policy wide enough to show a member their own lines on that
-- table would be one join from showing them somebody else's, and audit_log
-- also carries the club's own settings. Anchored surgery on the invariant
-- itself: the list is a literal inside security_report, and rewriting the whole
-- function to add one name is how two people editing it clobber each other.

do $$
declare
  src text := pg_get_functiondef('public.security_report()'::regprocedure);
  anchor text := $a$or c.relname in ('episode_segment_capacity', 'own_vetting_state', 'episode_capacity', 'member_directory', 'own_counter_signature', 'agreement_standing', 'member_league', 'member_engagement', 'member_affinity')$a$;
  replaced text := $a$or c.relname in ('episode_segment_capacity', 'own_vetting_state', 'episode_capacity', 'member_directory', 'own_counter_signature', 'agreement_standing', 'member_league', 'member_engagement', 'member_affinity', 'my_account_history')$a$;
begin
  /* Already on the list: nothing to do. Anchored surgery has to be idempotent
     or the corpus stops replaying the second time somebody runs it, and the
     replay is the only proof this repository owns its own schema. */
  if position('my_account_history' in src) > 0 then
    return;
  end if;
  if position(anchor in src) = 0 then
    raise exception 'the definer-view allowlist in security_report() is not where this migration expected it — read it before editing';
  end if;
  src := replace(src, anchor, replaced);
  if position('my_account_history' in src) = 0 then
    raise exception 'the allowlist edit did not take';
  end if;
  execute src;
end $$;

notify pgrst, 'reload schema';
