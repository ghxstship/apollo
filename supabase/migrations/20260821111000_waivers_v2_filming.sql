-- Waivers v2: the filming-consent clauses compose into both waivers and the new
-- versions publish. This is the versioning system doing the one thing it was
-- built for at a rebrand: every existing signature stays bound to the exact
-- Lyre-era text it hashed, everyone shows "out of date", and everyone re-signs
-- the wording that now includes the cameras.
do $$
declare
  doc record;
  old_ver uuid;
  new_ver uuid;
  next_n integer;
begin
  for doc in select code from public.documents where code in ('member-waiver','guest-waiver')
  loop
    select id into old_ver from public.document_versions
    where document_code = doc.code and status = 'published';
    select coalesce(max(version),0)+1 into next_n from public.document_versions
    where document_code = doc.code;

    insert into public.document_versions (document_code, version, status)
    values (doc.code, next_n, 'draft') returning id into new_ver;

    -- carry the standing composition
    insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
    select new_ver, clause_version_id, position, condition
    from public.document_clauses where document_version_id = old_ver;

    -- the cameras join, unconditional; minors clause rides the guest waiver only
    insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
    select new_ver, cv.id, 90 + cv_row.pos, '{}'::jsonb
    from (values ('filming-release', 1), ('voice-likeness', 2)) as cv_row(code, pos)
    join public.clause_versions cv on cv.clause_code = cv_row.code and cv.version = 1;

    if doc.code = 'guest-waiver' then
      insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
      select new_ver, cv.id, 93, '{}'::jsonb
      from public.clause_versions cv where cv.clause_code = 'minor-appearance' and cv.version = 1;
    end if;

    update public.document_versions set status = 'retired' where id = old_ver;
    update public.document_versions
    set status = 'published', effective_from = now(), published_at = now()
    where id = new_ver;
  end loop;
end;
$$;
