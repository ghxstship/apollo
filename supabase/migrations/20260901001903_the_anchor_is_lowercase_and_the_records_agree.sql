do $mig$
declare c record; n bigint; left_over text := ''; failures text := '';
begin
  /* Owner ruling 2026-08-31: the bracketed anchor is lowercase [un] — the case
     is part of the mark. The app flipped in the same change; this brings the
     records with it. REPAIR then ASSERT, walking the schema's own column list
     (a hand-written list is what made the brand purge incomplete twice).

     Literal replace(), not a regex: '[UN]' inside a regex is a character
     class, and the exact bracketed form is the entire match anyway. UN-
     boarding codes and the plain word UNHINGED carry no brackets and are
     untouched by construction.

     Ordering note: 20260828132337 WRITES '[UN]' as its replacement for the
     retired brands, so on a fresh replay this migration must sort after it —
     it does, by timestamp — and the assert below proves the corpus ends
     lowercase at this point in the sequence. */
  for c in
    select table_name, column_name, data_type from information_schema.columns
     where table_schema = 'public'
       and data_type in ('text','character varying','jsonb','json')
       and table_name <> 'clause_versions'   -- append-only legal text (holds no anchor today; excluded on principle)
     order by table_name, column_name
  loop
    begin
      execute format($f$
        update public.%I set %I = replace(%I::text, '[UN]', '[un]')::%s
        where position('[UN]' in %I::text) > 0
      $f$, c.table_name, c.column_name, c.column_name, c.data_type, c.column_name);
    exception when others then
      failures := failures || format(' %s.%s(%s)', c.table_name, c.column_name, sqlerrm);
    end;
  end loop;

  for c in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and data_type in ('text','character varying','jsonb','json')
       and table_name <> 'clause_versions'
  loop
    execute format($f$select count(*) from public.%I where position('[UN]' in %I::text) > 0$f$,
                   c.table_name, c.column_name) into n;
    if n > 0 then left_over := left_over || format(' %s.%s=%s', c.table_name, c.column_name, n); end if;
  end loop;

  if failures <> '' then raise notice 'columns the repair could not touch:%', failures; end if;
  if left_over <> '' then
    raise exception 'the uppercase anchor is still in the records:% (repair failures:%)', left_over, coalesce(nullif(failures,''), ' none');
  end if;
end $mig$;;
