
do $mig$
declare c record; n bigint; left_over text := ''; failures text := '';
begin
  /* REPAIR, then assert. Both walk the schema's own column list rather than a
     list written from memory — a list is what made this incomplete twice.

     The replacements are REGEXES on the brand word, not literal prefixes. The
     literal approach failed three times in a row on this one table: the repair
     looked for 'SYRIUS:', the seed writes 'LYRE SOCIAL:', and a check that
     enumerates the spellings it expects will always be one spelling behind the
     data. Match the word wherever it appears and let the surrounding text be
     whatever it is. */
  for c in
    select table_name, column_name, data_type from information_schema.columns
     where table_schema = 'public'
       and data_type in ('text','character varying','jsonb','json')
       and table_name <> 'clause_versions'   -- append-only legal text
     order by table_name, column_name
  loop
    begin
      execute format($f$
        update public.%I set %I = (
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(%I::text, '\m(syrius|lyre)\.social\M', 'unhingedsocial.us', 'gi'),
                '\m(syrius|lyre)[ -]social\M', '[UN]', 'gi'),
              '\m(syrius|lyre)\M', '[UN]', 'gi'),
            '\m(SYR|LYR|LYRE|LS)-(?=[A-Z0-9])', 'UN-', 'g')
        )::%s
        where %I::text ~* '(\m(syrius|lyre)\M)' or %I::text ~ '\m(SYR|LYR|LYRE|LS)-[A-Z0-9]'
      $f$, c.table_name, c.column_name, c.column_name, c.data_type, c.column_name, c.column_name);
    exception when others then
      /* Named, not swallowed. A repair that hides its own failures is how the
         previous version of this reported success while doing nothing. */
      failures := failures || format(' %s.%s(%s)', c.table_name, c.column_name, sqlerrm);
    end;
  end loop;

  for c in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and data_type in ('text','character varying','jsonb','json')
       and table_name <> 'clause_versions'
  loop
    execute format($f$select count(*) from public.%I where %I::text ~* '(\m(syrius|lyre)\M)' or %I::text ~ '\m(SYR|LYR|LYRE)-[A-Z0-9]'$f$,
                   c.table_name, c.column_name, c.column_name) into n;
    if n > 0 then left_over := left_over || format(' %s.%s=%s', c.table_name, c.column_name, n); end if;
  end loop;

  if failures <> '' then raise notice 'columns the repair could not touch:%', failures; end if;
  if left_over <> '' then
    raise exception 'a retired brand is still in the records:% (repair failures:%)', left_over, coalesce(nullif(failures,''), ' none');
  end if;
end $mig$;
;
