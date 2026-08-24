-- apollo-82's suggestion, and a good one. "Is this document mine to reach?"
-- was implemented by hand in five places — /agreements/[code]/page.tsx,
-- signature_standing(), guest_document(), published_version() and
-- sign_document() — and the two that had it least were the two that mattered
-- most: the resolver every signing path goes through, and the function that
-- writes the permanent record. We each fixed one. This is so nobody has to
-- remember for the sixth.
--
-- SCOPE, deliberately narrow. The check applies to SECURITY DEFINER functions
-- that take a document CODE as a parameter — the doors where an untrusted
-- caller names the document they want. Those must either filter documents.active
-- themselves or resolve through published_version(), which now does.
--
-- It does NOT apply to counter_sign() or publish_document_version(): both take
-- a uuid, so the caller names a row that already exists rather than any
-- document they fancy. counter_sign in particular SHOULD keep working on a
-- document that has since been retired — a countersignature completes a
-- contract a member really signed, and refusing it would strand that contract
-- rather than protect anybody.
--
-- And it is a source-shape assertion, not a semantic one: it proves the check
-- was written, not that it is right. That is still worth having — the failure
-- it catches is somebody adding a sixth door and not thinking about active at
-- all, which is exactly how the fifth came to disagree with the other four.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'security_report' limit 1;

  newsrc := replace(src,
    E'begin\n  if not public.is_staff() then raise exception ''staff only''; end if;\n',
    E'begin\n  if not public.is_staff() then raise exception ''staff only''; end if;\n\n'
    '  -- A definer that lets a caller name a document by code must decide whether\n'
    '  -- that document is still in use — itself, or through published_version().\n'
    '  return query\n'
    '  select ''document_door_checks_active'', p.proname::text,\n'
    '         p.prosrc ilike ''%published_version%''\n'
    '           or p.prosrc ilike ''%d.active%''\n'
    '           or p.prosrc ilike ''%documents.active%'',\n'
    '         case when p.prosrc ilike ''%published_version%'' then ''via published_version()''\n'
    '              when p.prosrc ilike ''%d.active%'' or p.prosrc ilike ''%documents.active%''\n'
    '                then ''filters documents.active''\n'
    '              else ''NEITHER — it can reach a document that is out of use'' end\n'
    '  from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
    '  where n.nspname = ''public'' and p.prosecdef\n'
    '    and pg_get_function_arguments(p.oid) ilike ''%document_code text%'';\n');

  if newsrc = src then
    raise exception 'could not place the document-door check in security_report';
  end if;
  execute newsrc;
end $outer$;;
