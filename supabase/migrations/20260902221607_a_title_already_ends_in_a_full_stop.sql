/* House style ends an episode title with a full stop — "Chicago: the founding
   night.", "E2E fixture sailing." — so any body that concatenates a title and
   then punctuates the sentence itself ships a doubled stop. 150 live rows in
   notifications carry one. It is cosmetic and it still ships, so the three
   writers now trim the title's own stop before adding the sentence's.

   rtrim(title, '.') and not a regexp: it is exact, it is cheap, and a title
   that does not end in a stop passes through untouched.

   The same rewrite finishes word_on_a_pass_offer, which was held back from
   the two previous migrations because all three of its problems live on the
   same two lines: the retired noun (a sailing / that sailing), the retired
   surface (your manifest), and the doubled stop.

   And one trailing space. settle_contest congratulates a regatta winner with
   'You took it. ' || coalesce(c.prize, ''), which leaves the space hanging
   whenever a contest carries no prize — 33 notifications and 33 pushes end in
   it today. rtrim() around the whole expression rather than a restructure,
   because the prize half is correct as written. */
do $mig$
declare
  d text; d2 text; fn oid; i int; n int;
  fixes text[][] := array[
    ['word_on_a_pass_offer',
     $o$'On ' || coalesce(v_title, 'a sailing') || '. Take it or decline it from your manifest.'$o$,
     $n$'On ' || rtrim(coalesce(v_title, 'an episode'), '.') || '. Take it or decline it from your Passes.'$n$],
    ['word_on_a_pass_offer',
     $o$'It is still yours, on ' || coalesce(v_title, 'that sailing') || '.'$o$,
     $n$'It is still yours, on ' || rtrim(coalesce(v_title, 'that episode'), '.') || '.'$n$],
    ['handle_episode_status',
     $o$'The gangway never saw you for ' || new.title || '.$o$,
     $n$'The gangway never saw you for ' || rtrim(new.title, '.') || '.$n$],
    ['settle_contest',
     $o$then 'You took it. ' || coalesce(c.prize, '')$o$,
     $n$then rtrim('You took it. ' || coalesce(c.prize, ''))$n$]
  ];
begin
  for i in 1 .. array_length(fixes, 1) loop
    select p.oid into fn from pg_proc p join pg_namespace n2 on n2.oid = p.pronamespace
     where n2.nspname = 'public' and p.prokind = 'f' and p.proname = fixes[i][1];
    if fn is null then raise exception 'no function named %', fixes[i][1]; end if;

    d  := pg_get_functiondef(fn);
    d2 := replace(d, fixes[i][2], fixes[i][3]);
    if d2 = d then
      raise exception '% no longer contains: %', fixes[i][1], fixes[i][2];
    end if;
    execute d2;
  end loop;

  -- The rows already queued or read. Bounded to the exact artefacts above:
  -- a doubled stop, and the one trailing space.
  update public.notifications set body = replace(body, '..', '.') where body like '%..%';
  get diagnostics n = row_count;
  raise notice 'notification bodies with a doubled stop: %', n;

  update public.notifications set body = rtrim(body) where body <> rtrim(body);
  get diagnostics n = row_count;
  raise notice 'notification bodies with a trailing space: %', n;

  update public.push_outbox set body = replace(body, '..', '.') where body like '%..%';
  update public.push_outbox set body = rtrim(body) where body <> rtrim(body);
  update public.push_outbox set title = replace(title, '..', '.') where title like '%..%';

  if exists (select 1 from public.notifications where body like '%..%' or body <> rtrim(body)) then
    raise exception 'a notification still carries a doubled stop or a trailing space';
  end if;
end $mig$;;
