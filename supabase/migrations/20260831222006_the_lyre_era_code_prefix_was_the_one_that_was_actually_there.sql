-- 243 email_outbox payloads and one sms_templates sample still carry LS- codes:
--   {"code": "LS-EESI-1005-0031", …}
--
-- Two failures stacked, and both are mine.
--
-- FIRST, the repair listed the prefixes I expected rather than the one that was
-- there. It handled SYR-, LYR- and LYRE-. LS- was the ACTUAL Lyre-era boarding
-- prefix (minted by 20260724132943) and the only one these payloads ever
-- contained; the three I did list appear in them nowhere. The assertion that
-- followed used the same list, so it agreed with the repair and reported clean.
--
-- SECOND, I edited 20260828132337 in place AFTER it had been applied, to add
-- LS-. schema_migrations already records that version, so the corrected file
-- will never run here — it fixes a fresh replay and leaves production dirty.
-- That is the sharpest edge of editing an applied migration and I walked onto
-- it while explaining why it was justified: the corpus rebuilds correctly and
-- the running database does not, and `migrations:replay` passes either way.
--
-- This is a NEW migration because that is the only thing production will run.
update public.email_outbox
   set payload = regexp_replace(payload::text, '\m(LS|SYR|LYR|LYRE)-(?=[A-Z0-9])', 'UN-', 'g')::jsonb
 where payload::text ~ '\m(LS|SYR|LYR|LYRE)-[A-Z0-9]';

update public.sms_templates
   set variable_samples = regexp_replace(variable_samples::text, '\m(LS|SYR|LYR|LYRE)-(?=[A-Z0-9])', 'UN-', 'g')::jsonb
 where variable_samples::text ~ '\m(LS|SYR|LYR|LYRE)-[A-Z0-9]';
update public.sms_templates
   set draft_body = regexp_replace(draft_body, '\m(LS|SYR|LYR|LYRE)-(?=[A-Z0-9])', 'UN-', 'g')
 where draft_body ~ '\m(LS|SYR|LYR|LYRE)-[A-Z0-9]';

-- The assertion now names every prefix the club has ever minted — LS- first,
-- because it is the one that was actually in the data — and it does NOT
-- swallow errors. The previous version's per-column `exception when others
-- then null` meant a column it could not read counted as clean.
do $$
declare c record; n bigint; left_over text := '';
begin
  for c in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public'
       and data_type in ('text','character varying','jsonb','json')
       and table_name <> 'clause_versions'   -- append-only legal text
  loop
    execute format(
      $q$select count(*) from public.%I where %I::text ~* '\m(syrius|lyre)\M' or %I::text ~ '\m(LS|SYR|LYR|LYRE)-[A-Z0-9]'$q$,
      c.table_name, c.column_name, c.column_name) into n;
    if n > 0 then left_over := left_over || format(' %s.%s=%s', c.table_name, c.column_name, n); end if;
  end loop;
  if left_over <> '' then
    raise exception 'a retired code prefix is still in the records:%', left_over;
  end if;
end $$;;
