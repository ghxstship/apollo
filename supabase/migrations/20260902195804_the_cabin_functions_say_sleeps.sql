/* cabins.berths became cabins.sleeps and three functions still read the old
   name. They are named here rather than matched by pattern, and that is the
   whole point of this migration.

   A blanket \mberths\M rewrite would ALSO have hit carry_the_clock,
   fan_out_notification, handle_episode_status and handle_pass_release — none of
   which touch a cabin. In those four, berths is a key inside
   profiles.notification_prefs, a member's choice about which notices they want.
   Renaming it there would silently reset every member's preferences to the
   default, because a key nobody wrote is a key with no answer.

   Same word, two meanings, one table apart. Name the three.

   cabin_places_open RETURNS the column, so its OUT parameter moves with it and
   CREATE OR REPLACE refuses to change a return row type — it is dropped and
   recreated, RESTRICT, so anything depending on it would refuse rather than
   vanish. */
do $$
declare fn record; src text; out text; n int := 0;
begin
  for fn in
    select p.oid,
           'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('cabin_places_open', 'guard_cabin_capacity', 'hold_a_cabin_on_option')
  loop
    src := pg_get_functiondef(fn.oid);
    out := regexp_replace(src, '\mberths\M', 'sleeps', 'g');
    if out is distinct from src then
      begin
        execute out;
      exception when invalid_function_definition then
        execute 'drop function ' || fn.sig;
        execute out;
      end;
      n := n + 1;
    end if;
  end loop;
  if n = 0 then
    raise exception 'no cabin function was patched — the column may already be renamed in them, or the names have moved';
  end if;
  raise notice 'cabin functions patched: %', n;
end $$;;
