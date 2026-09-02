/* Sailing is not a noun this club uses. EVERY event is an Episode (brand.ts,
   2026-09) — afloat or ashore, one noun, the show's own. The refusals in these
   bodies are otherwise exemplary, so this changes the noun and nothing else:
   no rewording, no repunctuation, no new sentences.

   Three things are deliberately NOT touched, and each of them would have been
   broken by a blanket replace:

   1. The VERB. guard_cabin_capacity and hold_a_cabin_on_option both say "a
      hull that is not sailing this passage", which is correct English and
      correct voice. pass_guard says "Regional passes sail from your home
      city". Only the noun was retired.
   2. The OUT columns. season_card() and passage_log() both RETURN TABLE with a
      column literally named sailings, and confer_marks and send_season_cards
      read it as s.sailings / c.sailings. Renaming a result column here would
      break every caller including src. It is plumbing and it stays.
   3. The payload keys. run_automations and handle_episode_status build a
      'sailing' key on purpose so that sms_templates.parameter_map, which is
      authored per template against that key, keeps resolving. Dropping it
      sends a member the literal string {{sailing}}, which this corpus has
      already shipped once.

   Each pair below is a whole refusal string rather than the bare word, so a
   partial match cannot silently rewrite a neighbouring line, and a pair that
   finds nothing raises rather than replaying green on a no-op.

   pass_not_in_the_past keeps 'that sailing is in the log, not on the manifest'
   for now: that line carries a second problem (manifest) and is corrected
   whole in the migration that follows this one. word_on_a_pass_offer likewise
   waits, because its two strings also concatenate a doubled full stop. */
do $mig$
declare
  d text; d2 text; fn oid; i int;
  fixes text[][] := array[
    ['a_hull_with_claimed_cabins_stays',
     $o$then take the hull off the sailing$o$, $n$then take the hull off the episode$n$],
    ['accept_pass_transfer',
     $o$a pass on a composition sailing stays with its member$o$,
     $n$a pass on a composition episode stays with its member$n$],
    ['accept_pass_transfer',
     $o$you already hold a pass on that sailing$o$, $n$you already hold a pass on that episode$n$],
    ['an_episode_inside_the_window_is_cancelled_not_struck',
     $o$inside the credit window a sailing is cancelled, not struck$o$,
     $n$inside the credit window an episode is cancelled, not struck$n$],
    ['check_promo',
     $o$That code is for another sailing.$o$, $n$That code is for another episode.$n$],
    ['claim_a_daybed',
     $o$% daybed groups a sailing — all are spoken for$o$,
     $n$% daybed groups an episode — all are spoken for$n$],
    ['claim_a_daybed',
     $o$the daybed is already yours on this sailing$o$,
     $n$the daybed is already yours on this episode$n$],
    ['claim_a_daybed',
     $o$on a sailing that is still to come$o$, $n$on an episode that is still to come$n$],
    ['comp_a_pass_for_sponsor',
     $o$that member already holds a pass on this sailing$o$,
     $n$that member already holds a pass on this episode$n$],
    ['comp_a_pass_for_sponsor',
     $o$that sponsor is not on this sailing — place the activation first$o$,
     $n$that sponsor is not on this episode — place the activation first$n$],
    ['episode_status_is_a_course',
     $o$a sailing does not go from % to %$o$, $n$an episode does not go from % to %$n$],
    ['episode_status_is_a_course',
     $o$a sailing in the log stays in the log$o$, $n$an episode in the log stays in the log$n$],
    ['guard_pass_stays_on_its_episode',
     $o$a pass belongs to the sailing it was booked for$o$,
     $n$a pass belongs to the episode it was booked for$n$],
    ['guard_the_ratio',
     $o$this sailing seats by segment — the pass has to say which$o$,
     $n$this episode seats by segment — the pass has to say which$n$],
    ['guard_the_vetting',
     $o$this sailing seats 25 to 45, with no exceptions$o$,
     $n$this episode seats 25 to 45, with no exceptions$n$],
    ['hold_the_radar_lock',
     $o$radar does not run on this sailing$o$, $n$radar does not run on this episode$n$],
    ['hold_the_radar_lock',
     $o$radar is live aboard only — this sailing is not under way$o$,
     $n$radar is live aboard only — this episode is not under way$n$],
    ['hold_the_radar_lock',
     $o$that pass is not on this sailing$o$, $n$that pass is not on this episode$n$],
    ['number_the_waitlist',
     $o$you already hold a pass on this sailing — the line is for those who do not$o$,
     $n$you already hold a pass on this episode — the line is for those who do not$n$],
    ['offer_the_next_place',
     $o$this sailing does not seat that segment$o$, $n$this episode does not seat that segment$n$],
    ['open_the_captains_log',
     $o$radar does not run on this sailing$o$, $n$radar does not run on this episode$n$],
    ['open_the_radar', $o$'no such sailing'$o$, $n$'no such episode'$n$],
    ['open_the_radar',
     $o$that sailing is in the log — the radar cannot open behind it$o$,
     $n$that episode is in the log — the radar cannot open behind it$n$],
    ['pass_not_in_the_past',
     $o$that sailing has already left$o$, $n$that episode has already left$n$],
    ['radar_sweep',
     $o$radar does not run on this sailing$o$, $n$radar does not run on this episode$n$],
    ['settle_the_match_guarantee',
     $o$Match Guarantee — no shared anchors on this sailing.$o$,
     $n$Match Guarantee — no shared anchors on this episode.$n$],
    ['settle_the_match_guarantee',
     $o$ credit is already on your next sailing — no form, no request.$o$,
     $n$ credit is already on your next episode — no form, no request.$n$],
    ['sign_document_as_guest',
     $o$that sailing has gone — there is nothing left to sign$o$,
     $n$that episode has gone — there is nothing left to sign$n$]
  ];
begin
  for i in 1 .. array_length(fixes, 1) loop
    select p.oid into fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.proname = fixes[i][1];
    if fn is null then raise exception 'no function named %', fixes[i][1]; end if;

    d  := pg_get_functiondef(fn);
    d2 := replace(d, fixes[i][2], fixes[i][3]);
    if d2 = d then
      raise exception '% no longer contains: %', fixes[i][1], fixes[i][2];
    end if;
    execute d2;
  end loop;
end $mig$;;
