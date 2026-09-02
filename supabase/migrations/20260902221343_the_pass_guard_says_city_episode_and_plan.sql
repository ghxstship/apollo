/* pass_guard held a banned term in a live refusal. src/lib/errors.ts passes a
   guard message through verbatim, so every string raised here is product copy
   and the route audit reads it the moment it renders. Three of them said
   "home harbor" and "every US harbor"; "harbor " with its trailing space has
   been banned since the city rename, so the page would have failed its own
   gate the first time a Regional member picked the wrong episode.

   The member page already words this rule correctly — passes/page.tsx lockFor()
   renders "Regional passes sail from your home city — choose it on your page."
   and "... this one leaves from X. National sails every US city." The guard now
   says the same sentence, minus the full stop this corpus never puts on a
   refusal, so the page and the door cannot drift apart again. Note that the
   VERB survives: passes still sail from a city, which is on-voice. It is the
   noun that was retired.

   Two more in the same body while it is open. The event noun is Episode, not
   sailing (2026-09 rename). And the class ceiling had three words for one
   concept: the guard said "setting tier" and "a deeper tier" where the UI says
   class and plan — "This episode runs past your class. X passes open on a
   deeper plan." Setting is the OTHER axis (Afloat/Ashore) and naming it here
   was simply wrong.

   The comments come along, because this corpus treats them as the house
   record and a body that refuses in one language and reasons in another is
   worse than either. "harbour month" and "the harbour's day" were the British
   spelling of the same retired noun and slipped the gate on the u; both meant
   local time, so they now say so.

   'the manifest is full — join the waitlist' is deliberately untouched. A
   manifest is the boarding list for ONE episode and this refusal is raised
   with that episode in view, so the word is doing its literal job. */
do $mig$
declare
  d text; d2 text; fn oid; i int;
  fixes text[][] := array[
    [$o$Regional passes sail from your home harbor — choose it on your page first$o$,
     $n$Regional passes sail from your home city — choose it on your page$n$],
    [$o$Regional passes sail from your home harbor — this one leaves from %. National sails every US harbor$o$,
     $n$Regional passes sail from your home city — this one leaves from %. National sails every US city$n$],
    [$o$'another harbor'$o$, $n$'another city'$n$],
    [$o$this sailing seats by segment — join the line on the vetting page$o$,
     $n$this episode seats by segment — join the line on the vetting page$n$],
    [$o$passes for this sailing open at % tier$o$, $n$passes for this episode open at % tier$n$],
    [$o$this sailing runs past your setting tier — % passes open at a deeper tier$o$,
     $n$this episode runs past your class — % passes open on a deeper plan$n$],
    [$o$-- segment sailing belongs in the numbered line$o$,
     $n$-- segment episode belongs in the numbered line$n$],
    [$o$-- sailing so two bookings cannot both read the last berth as free.$o$,
     $n$-- episode so two bookings cannot both read the last berth as free.$n$],
    [$o$-- The drop. A sailing with a stated on-sale hour holds its door until then;$o$,
     $n$-- The drop. An episode with a stated on-sale hour holds its door until then;$n$],
    [$o$-- on sale from the moment the sailing exists.$o$,
     $n$-- on sale from the moment the episode exists.$n$],
    [$o$counted on each sailing's own$o$, $n$counted on each episode's own$n$],
    [$o$-- harbour month rather than on UTC's.$o$, $n$-- local month rather than on UTC's.$n$],
    [$o$named in the harbour's day.$o$, $n$named in the local day.$n$]
  ];
begin
  select p.oid into fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'pass_guard';
  if fn is null then raise exception 'pass_guard is not here to be corrected'; end if;

  d := pg_get_functiondef(fn);
  for i in 1 .. array_length(fixes, 1) loop
    d2 := replace(d, fixes[i][1], fixes[i][2]);
    if d2 = d then
      raise exception 'pass_guard no longer contains %', fixes[i][1];
    end if;
    d := d2;
  end loop;
  execute d;

  d := pg_get_functiondef(fn);
  if d ~ 'harbo' or d ~ 'sailing' or d ~ 'setting tier' then
    raise exception 'pass_guard still carries a retired noun';
  end if;
end $mig$;;
