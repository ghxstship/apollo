/* Two leftovers of the same shape, both invisible until something ran.

   ONE: seven function bodies still WRITE values the CHECK now refuses.
   Renaming rows and tightening a constraint moves the past; it does nothing to
   the code that writes the future, and here that code is the money path.
   handle_pass_aboard and handle_pass_release write the account line for a pass,
   charge_shop_order writes the line for a shop order, draw_installments writes
   a scheduled charge. Every one would have raised a check violation on the next
   real booking. The e2e suite found it as a 23514 on placing an order.

   TWO: function bodies still DECLARE the old type names. ALTER TYPE ... RENAME
   moves the type by OID, so columns and signatures follow — but a plpgsql
   `declare holder_status rsvp_status` is text like any other body reference and
   is resolved at first execution. accept_pass_transfer failed with "type
   rsvp_status does not exist" the moment this migration tried to recreate it,
   which is how the miss surfaced. The earlier body rewrite listed tables and
   columns and simply had no entry for a type.

   Quoted-literal patterns for the values, word-bounded ones for the types, so
   experience_class is untouched by event_class and a column that happens to
   share a word is safe. */
do $$
declare
  fn record;
  src text;
  out text;
  n int := 0;
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
    -- the retired stored values
    out := replace(out, '''berth''', '''pass''');
    out := replace(out, '''chandlery''', '''shop''');
    out := replace(out, '''sailings''', '''episodes''');
    out := replace(out, '''harbors''', '''cities''');
    -- the renamed types, still named in declarations and casts
    out := regexp_replace(out, '\mrsvp_status\M', 'pass_status', 'g');
    out := regexp_replace(out, '\mvoyage_status\M', 'episode_status', 'g');
    out := regexp_replace(out, '\mevent_class\M', 'setting', 'g');
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
    raise exception 'nothing was rewritten — either this already ran, or the patterns stopped matching and the writers are unprotected';
  end if;
  raise notice 'rewrote % function bodies', n;
end $$;

/* Prove it, both ways. A value no CHECK admits, or a type no longer present,
   is a failure the next member pays for. */
  /* prokind = 'f' is not optional. pg_get_functiondef raises on an aggregate,
     and an extension installed into public brings its own — so a guard without
     this clause passes on the live database and fails on replay, which is the
     worst possible place to learn it. */
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ')
    into bad
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.prokind = 'f'
    and (pg_get_functiondef(p.oid) ~ '''berth'''
      or pg_get_functiondef(p.oid) ~ '''chandlery'''
      or pg_get_functiondef(p.oid) ~ '''sailings'''
      or pg_get_functiondef(p.oid) ~ '''harbors'''
      or pg_get_functiondef(p.oid) ~ '\m(rsvp_status|voyage_status|event_class)\M');
  if bad is not null then
    raise exception 'still carrying a retired value or type: %', bad;
  end if;
end $$;;
