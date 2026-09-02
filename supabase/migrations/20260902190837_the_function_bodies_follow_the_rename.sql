/* The half of a rename Postgres will not do for you.

   Foreign keys, indexes, policies and views hold parse trees and followed the
   two rename migrations automatically. A plpgsql body is stored as TEXT and is
   re-parsed only when it next executes, so every function naming a renamed
   relation is a runtime failure waiting for its first caller — here that
   includes rsvp_guard and the account-ledger triggers, which is the money path.

   String surgery on pg_get_functiondef, the technique already used in this
   corpus. Four things make it safe to run unattended, and three of them were
   learned by this migration failing:

   1. Every pattern is word-bounded, so voyages does not match inside
      voyage_capacity and rsvps does not match inside rsvp_addons.
   2. ORDER IS LOAD-BEARING. episodes -> episode_cuts runs BEFORE
      voyages -> episodes, or the second pass swallows the first and every
      reference ends up pointing at the recap table. template_voyage_id is
      rewritten before the generic voyage_id for the same reason.
   3. A function whose OUT parameters are renamed cannot be replaced in place —
      CREATE OR REPLACE refuses to change a return row type. season_card proved
      it by failing here: it returns a column literally named harbors. Those are
      dropped and recreated, RESTRICT, so anything actually depended upon
      refuses rather than cascading silently.
   4. class and format could not be skipped after all. calendar_feed is
      LANGUAGE sql, whose body IS validated at creation, and it failed on
      v.class the moment the column became v.setting. Both are safe to rewrite
      once you know the rules:
        - underscore is a word character in Postgres regex, so \mclass\M cannot
          match inside pg_class, event_class or experience_class. Only the bare
          column matches.
        - format is a builtin as well as a column, so the pattern refuses any
          occurrence followed by an opening paren. format(...) survives;
          v.format becomes v.series.

   port is deliberately left alone. It is not mainly a column here — it is the
   string literal 'port' in the setting enum — and its two real column uses
   point at different words (a leg calls at a place, a crew role sits in a
   city). Those two are done by hand afterwards. */
do $$
declare
  fn record;
  src text;
  out text;
  n int := 0;
  dropped int := 0;
  subs text[][] := array[
    array['episodes', 'episode_cuts'],
    array['voyages', 'episodes'],
    array['template_voyage_id', 'template_episode_id'],
    array['voyage_series', 'editions'],
    array['voyage_capacity', 'episode_capacity'],
    array['voyage_daybeds', 'episode_daybeds'],
    array['voyage_legs', 'episode_legs'],
    array['voyage_media', 'episode_media'],
    array['voyage_radar', 'episode_radar'],
    array['voyage_segment_capacity', 'episode_segment_capacity'],
    array['voyage_segment_caps', 'episode_segment_caps'],
    array['voyage_sponsors', 'episode_sponsors'],
    array['voyage_stops', 'episode_stops'],
    array['voyage_vessels', 'episode_vessels'],
    array['voyage_id', 'episode_id'],
    array['home_harbor', 'home_city'],
    array['harbor_id', 'city_id'],
    array['harbors', 'cities'],
    array['activity_formats', 'series'],
    array['fathoms_ledger', 'knots_ledger'],
    array['fathoms_balance', 'knots_balance'],
    array['fathoms_multiplier', 'knots_multiplier'],
    array['dispatch_posts', 'log_posts'],
    array['wardroom_posts', 'open_deck_posts'],
    array['wardroom_comments', 'open_deck_comments'],
    array['wardroom_flags', 'open_deck_flags'],
    array['wardroom_hails', 'open_deck_hails'],
    array['dating_tables', 'tables'],
    array['rsvp_addons', 'pass_addons'],
    array['rsvp_guests', 'pass_guests'],
    array['rsvps', 'passes'],
    array['berths_total', 'passes_total'],
    array['berths_left', 'passes_left'],
    array['class', 'setting']
  ];
  i int;
begin
  for fn in
    select p.oid,
           'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
  loop
    src := pg_get_functiondef(fn.oid);
    out := src;
    for i in 1 .. array_length(subs, 1) loop
      out := regexp_replace(out, '\m' || subs[i][1] || '\M', subs[i][2], 'g');
    end loop;
    /* The column, never the builtin: any format not followed by ( is ours. */
    out := regexp_replace(out, '\mformat\M(?!\s*\()', 'series', 'g');

    if out is distinct from src then
      begin
        execute out;
      exception when invalid_function_definition then
        execute 'drop function ' || fn.sig;
        execute out;
        dropped := dropped + 1;
      end;
      n := n + 1;
    end if;
  end loop;

  if n = 0 then
    raise exception 'no function bodies were rewritten — the patterns have stopped matching and this migration is a no-op that would replay green onto a broken database';
  end if;
  raise notice 'rewrote % function bodies (% needed a drop and recreate)', n, dropped;
end $$;;
