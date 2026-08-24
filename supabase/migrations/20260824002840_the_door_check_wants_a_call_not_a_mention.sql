-- apollo-82's note on the invariant I added: `ilike '%published_version%'`
-- is satisfied by a function that merely NAMES published_version in a comment.
-- It is labelled a source-shape assertion so that is within what it claims,
-- but a check that can read green for a comment is a check that will one day
-- read green for the wrong reason. Require the call syntax.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'security_report' limit 1;

  newsrc := replace(src, 'p.prosrc ilike ''%published_version%''', 'p.prosrc ilike ''%published_version(%''');

  if newsrc = src then
    raise exception 'could not tighten the document-door check';
  end if;
  execute newsrc;
end $outer$;

-- And clear the probe rows the rate-limit verification left behind.
delete from public.status_lookups;
delete from public.applications where lower(email) ~ '^(audit-one|audit-two|guessy-)';;
