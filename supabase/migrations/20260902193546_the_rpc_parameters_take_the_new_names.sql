/* Parameter names are part of the callable API, not private to the body:
   PostgREST dispatches on them, so a client literally sends {"p_voyage": ...}
   over the wire. Full alignment has to reach them.

   Postgres will not rename an input parameter with CREATE OR REPLACE — it
   refuses with "cannot change name of input parameter" — so each of these is a
   DROP and a CREATE, RESTRICT.

   AND RESTRICT EARNED ITS KEEP ON THE FIRST RUN. passes_left is depended on by
   the episode_capacity view, and dropping it would have taken the view with it
   under CASCADE — the view every capacity figure in the product reads. So a
   function that something else pins is SKIPPED rather than forced, and the
   notice at the end names them.

   Skipping costs nothing that matters. A function pinned by a view is called by
   that view, not over the wire, so its parameter names were never part of the
   client API and renaming them aligns nothing a reader or a caller can see.
   Never add CASCADE here to make the count go up. */
do $$
declare
  fn record;
  src text;
  out text;
  n int := 0;
  skipped text[] := '{}';
  subs text[][] := array[
    array['p_voyage_id', 'p_episode_id'],
    array['p_except_rsvp', 'p_except_pass'],
    array['p_voyage', 'p_episode'],
    array['p_rsvp', 'p_pass']
  ];
  i int;
begin
  for fn in
    select p.oid, p.proname,
           'public.' || quote_ident(p.proname) || '(' ||
             pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prokind = 'f'
      and pg_get_function_identity_arguments(p.oid) ~ '\m(p_voyage|p_voyage_id|p_rsvp|p_except_rsvp)\M'
  loop
    src := pg_get_functiondef(fn.oid);
    out := src;
    for i in 1 .. array_length(subs, 1) loop
      out := regexp_replace(out, '\m' || subs[i][1] || '\M', subs[i][2], 'g');
    end loop;
    begin
      execute 'drop function ' || fn.sig;
      execute out;
      n := n + 1;
    exception when dependent_objects_still_exist then
      skipped := skipped || fn.proname;
    end;
  end loop;

  if n = 0 then
    raise exception 'no RPC parameters were renamed — the patterns have stopped matching';
  end if;
  raise notice 'renamed parameters on % functions; pinned by other objects and left alone: %',
    n, coalesce(array_to_string(skipped, ', '), 'none');
end $$;

/* A LIVE BUG, found by reading run_automations during the rename rather than by
   any test: the function builds its match context with a 'harbor' key while the
   Bridge writes rule conditions with a 'city' key. Matching is jsonb
   containment, so a rule conditioned on a city was not failing loudly — it was
   simply never firing, and had not been since the City rename. Automations are
   how weather holds and boarding notices reach members.

   The stored conditions move with the context key, so rules already written
   keep working instead of needing to be re-authored. */
do $$
declare n int;
begin
  update public.automations
     set conditions = (conditions - 'harbor') || jsonb_build_object('city', conditions->'harbor')
   where conditions ? 'harbor';
  get diagnostics n = row_count;
  raise notice 'automation rules rekeyed harbor -> city: %', n;

  update public.automations
     set conditions = (conditions - 'class') || jsonb_build_object('setting', conditions->'class')
   where conditions ? 'class';
  get diagnostics n = row_count;
  raise notice 'automation rules rekeyed class -> setting: %', n;
end $$;;
