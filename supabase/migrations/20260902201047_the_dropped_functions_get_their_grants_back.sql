/* A SECURITY REGRESSION I INTRODUCED, and the reason to write this down rather
   than quietly fix it.

   Renaming a function's input parameters requires DROP + CREATE, because
   Postgres refuses to change a parameter name in place. DROP takes the
   function's ACL with it, and CREATE hands the new function the default —
   EXECUTE to PUBLIC. Every REVOKE the corpus had applied to these was
   therefore silently undone by the parameter rename two migrations ago.

   The e2e suite caught exactly one symptom: check_promo became callable by an
   anonymous visitor, which means anyone could have probed promo codes without
   signing in. The other nineteen were the same shape and would not have shown
   up until someone went looking.

   Every line below is read off the original migration that first granted it —
   the intent is the corpus's, not mine. Three of them (lapse_stale_waitlist_
   offers, mint_boarding_code, run_automations) are revoked from authenticated
   as well: they are called by triggers and cron, never by a person.

   If a future rename drops a function again, this file is the reminder that
   the grants do not come back on their own. */

revoke all on function public.assign_vessels_evenly(uuid) from public, anon;
grant execute on function public.assign_vessels_evenly(uuid) to authenticated;

revoke all on function public.attach_addons(uuid, uuid[], integer) from public, anon;
grant execute on function public.attach_addons(uuid, uuid[], integer) to authenticated;

revoke all on function public.cabin_places_open(uuid) from public, anon;
grant execute on function public.cabin_places_open(uuid) to authenticated;

revoke all on function public.check_promo(text, uuid) from public, anon;
grant execute on function public.check_promo(text, uuid) to authenticated;

revoke all on function public.claim_a_daybed(uuid) from public, anon;
grant execute on function public.claim_a_daybed(uuid) to authenticated;

revoke all on function public.comp_a_pass_for_sponsor(uuid, uuid, uuid) from public, anon;
grant execute on function public.comp_a_pass_for_sponsor(uuid, uuid, uuid) to authenticated;

revoke all on function public.episode_manifest(uuid) from public, anon;
grant execute on function public.episode_manifest(uuid) to authenticated;

revoke all on function public.hold_a_cabin_on_option(uuid, uuid) from public, anon;
grant execute on function public.hold_a_cabin_on_option(uuid, uuid) to authenticated;

revoke all on function public.issue_the_envelopes(uuid) from public, anon;
grant execute on function public.issue_the_envelopes(uuid) to authenticated;

revoke all on function public.offer_the_next_place(uuid, text) from public, anon;
grant execute on function public.offer_the_next_place(uuid, text) to authenticated;

revoke all on function public.open_the_radar(uuid) from public, anon;
grant execute on function public.open_the_radar(uuid) to authenticated;

revoke all on function public.pass_price(uuid, text) from public, anon;
grant execute on function public.pass_price(uuid, text) to authenticated;

revoke all on function public.place_galley_order(uuid, jsonb, text) from public, anon;
grant execute on function public.place_galley_order(uuid, jsonb, text) to authenticated;

revoke all on function public.radar_sweep(uuid) from public, anon;
grant execute on function public.radar_sweep(uuid) to authenticated;

revoke all on function public.seed_the_run_of_show(uuid) from public, anon;
grant execute on function public.seed_the_run_of_show(uuid) to authenticated;

revoke all on function public.season_card(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.season_card(uuid, timestamptz, timestamptz) to authenticated;

revoke all on function public.sponsor_credits(uuid) from public;
grant execute on function public.sponsor_credits(uuid) to anon, authenticated;

/* Machinery, not people. These three are reached by trigger and by cron and
   were revoked from authenticated too. */
revoke all on function public.lapse_stale_waitlist_offers(uuid, text) from public, anon, authenticated;
revoke all on function public.mint_boarding_code(uuid, text) from public, anon, authenticated;
revoke all on function public.run_automations(text, uuid, uuid) from public, anon, authenticated;

/* Prove the one the suite caught is actually closed again. */
do $$
begin
  if has_function_privilege('anon', 'public.check_promo(text, uuid)', 'execute') then
    raise exception 'check_promo is still reachable by anon';
  end if;
end $$;;
