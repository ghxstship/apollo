/* The rule: a manifest is the boarding list for ONE episode, and the word
   appears only where a specific episode is in view. Everywhere it meant "the
   passes you hold" it is now Passes, which is also the route a member can
   actually open — /manifest has 308'd to /passes since the surfaces were
   aligned, so the copy was pointing at a page that no longer exists under
   that name.

   Corrected here:

   - accept_pass_transfer     the letter to the member who gave a pass away
   - guard_pass_transfer      the refusal when a transfer is written by hand
   - handle_profile_status    the letter when a membership goes on hold
   - handle_pass_release      the letter to someone who claims by hand
   - decide_a_proposal        the letter when the Bridge approves a proposal
   - pass_not_in_the_past     which also still said sailing; corrected whole
   - apply_with_invite        see below

   handle_new_user is a different error and a worse one. The welcome letter
   said "The manifest arrives each Sunday", but the Sunday letter is the
   editorial digest, and since the rename that is The Log — Episode now means
   an EVENT, and the written record took the name the standfirst already gave
   it. A new member was being promised a boarding list every week.

   apply_with_invite raised 'a name, as the manifest should read it' from a
   club application, where no episode is in view at all. The gangway is what
   actually reads a name, and it is a surface the applicant is about to meet.

   Left alone on purpose, because the rule protects them:

   - pass_guard    'the manifest is full — join the waitlist'
   - guard_the_ratio 'the manifest is full at % — the waitlist runs in order'
     Both are raised with one episode in view and both mean that episode's
     boarding list. That is the word doing its literal job.
   - The notifications.kind value 'manifest', the columns on_manifest and
     show_on_manifest, episode_manifest() and set_manifest_visibility(). All
     plumbing, none of it rendered.

   word_on_a_pass_offer also carries the word and is corrected in the next
   migration, where its doubled full stop is fixed in the same rewrite. */
do $mig$
declare
  d text; d2 text; fn oid; i int;
  fixes text[][] := array[
    ['accept_pass_transfer',
     $o$It is off your manifest and your account is squared.$o$,
     $n$It is off your Passes and your account is squared.$n$],
    ['guard_pass_transfer',
     $o$a pass is taken over from your manifest, not by hand$o$,
     $n$a pass is taken over from your Passes, not by hand$n$],
    ['handle_profile_status',
     $o$release them from the manifest if the tide has turned$o$,
     $n$release them from your Passes if the tide has turned$n$],
    ['handle_pass_release',
     $o$The pass is on the manifest now — first come, first aboard.$o$,
     $n$The pass is open in Passes now — first come, first aboard.$n$],
    ['handle_pass_release',
     $o$-- theirs to make from the manifest.$o$, $n$-- theirs to make from Passes.$n$],
    ['decide_a_proposal',
     $o$you''ll see it on the manifest when passes open.$o$,
     $n$you''ll see it in Passes when passes open.$n$],
    ['pass_not_in_the_past',
     $o$that sailing is in the log, not on the manifest$o$,
     $n$that episode is in the log, not in Passes$n$],
    ['handle_new_user',
     $o$Your pass to the water is set. The manifest arrives each Sunday.$o$,
     $n$Your pass to the water is set. The Log arrives each Sunday.$n$],
    ['apply_with_invite',
     $o$a name, as the manifest should read it$o$,
     $n$a name, as the gangway should read it$n$]
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
