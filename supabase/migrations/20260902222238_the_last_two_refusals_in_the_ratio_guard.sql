/* Two refusals in guard_the_ratio survived the episode pass, and they survived
   it for a reason worth recording: the sweep that found the others lifted
   string literals with a regex, and a regex cannot tell a quote that opens a
   string from one standing inside a comment as an apostrophe. Every function
   with an apostrophe in a comment above the line desynchronised the pairing
   and hid the strings that followed. Scanning `raise exception '...'` per line
   instead — anchored on the keyword rather than on quote counting — found
   these two, and confirmed the rest of the corpus is clean. Anyone auditing
   this corpus for copy should use the line-anchored form.

   'a ratio sailing' and 'this sailing does not seat that segment' are the same
   substitution as the rest: the noun, and nothing else. The comment above the
   first of them said it too, and comes along for the same reason it did in
   pass_guard — a body that refuses in one language and reasons in another is
   worse than either. */
do $mig$
declare
  d text; d2 text; fn oid; i int;
  fixes text[][] := array[
    [$o$a ratio sailing carries no companions — every seat is a vetted pass of its own$o$,
     $n$a ratio episode carries no companions — every seat is a vetted pass of its own$n$],
    [$o$'this sailing does not seat that segment'$o$, $n$'this episode does not seat that segment'$n$],
    [$o$-- A ratio sailing has no guest passes.$o$, $n$-- A ratio episode has no guest passes.$n$]
  ];
begin
  select p.oid into fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proname = 'guard_the_ratio';
  if fn is null then raise exception 'guard_the_ratio is not here to be corrected'; end if;

  d := pg_get_functiondef(fn);
  for i in 1 .. array_length(fixes, 1) loop
    d2 := replace(d, fixes[i][1], fixes[i][2]);
    if d2 = d then raise exception 'guard_the_ratio no longer contains: %', fixes[i][1]; end if;
    d := d2;
  end loop;
  execute d;

  -- Nothing named sailing survives, and the one refusal that correctly names a
  -- single episode's boarding list is still standing.
  d := pg_get_functiondef(fn);
  if d ~ 'sailing' then raise exception 'guard_the_ratio still says sailing'; end if;
  if d !~ 'the manifest is full at' then
    raise exception 'guard_the_ratio lost the refusal that correctly names a manifest';
  end if;
end $mig$;;
