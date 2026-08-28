-- The sweep and its invariant only ever looked at text and varchar columns.
-- Structured payloads were never in scope, so a sent email carrying
-- {"code": "LYRE-MMXXVI-TEST"} sat there through two supposedly complete
-- passes. Fourth pattern of mine today that looked exhaustive and was not.
update public.email_outbox
   set payload = replace(replace(replace(payload::text, 'LYRE-', 'UN-'), 'SYR-', 'UN-'), 'LYR-', 'UN-')::jsonb
 where payload::text ~* '(\msyrius\M|\mlyre\M|SYR-|LYR-)';

-- One invariant over BOTH shapes. Text and json in the same loop, so neither
-- can be the one somebody forgets next time.
do $$
declare c record; n bigint; left_over text := '';
begin
  for c in
    select table_name, column_name, data_type from information_schema.columns
     where table_schema = 'public'
       and data_type in ('text', 'character varying', 'jsonb', 'json')
       and table_name <> 'clause_versions'   -- append-only legal text; superseded, never edited
  loop
    begin
      execute format(
        $q$select count(*) from public.%I where %I::text ~* '(\msyrius\M|\mlyre\M|SYR-|LYR-)'$q$,
        c.table_name, c.column_name) into n;
      if n > 0 then left_over := left_over || format(' %s.%s=%s', c.table_name, c.column_name, n); end if;
    exception when others then null;
    end;
  end loop;
  if left_over <> '' then
    raise exception 'a retired brand is still in the records:%', left_over;
  end if;
end $$;;
