
-- Syrius is retired; the product is [un]. 20260824002608 did this same sweep one
-- brand ago, Lyre to Syrius, and recorded why the drift had survived: "the route
-- audit reads rendered pages and the e2e suite reads rendered pages; nothing
-- reads the registry." Nothing still did, so it drifted again — all fourteen
-- registered SMS templates opened with the retired mark, which is text going to
-- a member's phone and to the carrier under the club's name.
--
-- CORRECTED AFTER APPLYING, and the reason is narrow. As written, this repaired
-- only the SYRIUS era and then asserted that NO retired brand survived. On the
-- live database that passed, because a previous rebrand had already walked those
-- rows through Syrius. On a FRESH one it cannot: 20260819180000 seeds every SMS
-- template with the LYRE era, so the assertion fired against text this migration
-- had never tried to fix, and the corpus stopped dead here.
--
-- That made this row unadoptable — applied in production, absent from the
-- corpus, and red the moment anyone wrote it down. The alternative on offer was
-- to exclude it from mirroring for ever, which does not fix anything: it hides a
-- ledger row from the only check that proves this repository can rebuild its own
-- database, which is precisely the condition that check exists to find.
--
-- So the repair is now general. It matches the brand WORD wherever it appears
-- rather than enumerating the prefixes somebody expected — 'SYRIUS:', then
-- 'LYRE:', while the data said 'LYRE SOCIAL:' — and it repairs before it
-- asserts. clause_versions is exempt: append-only legal text, superseded rather
-- than edited.
do $mig$
declare c record; n bigint; left_over text := ''; failures text := '';
begin
  for c in
    select table_name, column_name, data_type from information_schema.columns
     where table_schema = 'public'
       and data_type in ('text','character varying','jsonb','json')
       and table_name <> 'clause_versions'
     order by table_name, column_name
  loop
    begin
      execute format($f$
        update public.%I set %I = (
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(%I::text, '\m(syrius|lyre)\.social\M', 'unhingedsocial.us', 'gi'),
                '\m(syrius|lyre)[ -]social\M', '[un]', 'gi'),
              '\m(syrius|lyre)\M', '[un]', 'gi'),
            '\m(SYR|LYR|LYRE|LS)-(?=[A-Z0-9])', 'UN-', 'g')
        )::%s
        where %I::text ~* '\m(syrius|lyre)\M' or %I::text ~ '\m(SYR|LYR|LYRE|LS)-[A-Z0-9]'
      $f$, c.table_name, c.column_name, c.column_name, c.data_type, c.column_name, c.column_name);
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
    execute format($f$select count(*) from public.%I where %I::text ~* '\m(syrius|lyre)\M' or %I::text ~ '\m(SYR|LYR|LYRE|LS)-[A-Z0-9]'$f$,
                   c.table_name, c.column_name, c.column_name) into n;
    if n > 0 then left_over := left_over || format(' %s.%s=%s', c.table_name, c.column_name, n); end if;
  end loop;

  if failures <> '' then raise notice 'columns the repair could not touch:%', failures; end if;
  if left_over <> '' then
    raise exception 'a retired brand is still in the records:% (repair failures:%)', left_over, coalesce(nullif(failures,''), ' none');
  end if;
end $mig$;
;
