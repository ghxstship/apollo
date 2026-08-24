-- The guard told the operator what was wrong and not what to do about it, and
-- a refusal with no way forward is the dead end this pass keeps finding.
--
-- Both dialog paths that could create a duplicate are closed now (the checkbox
-- and the condition dropdown both address the composed version rather than the
-- catalogue's latest), so reaching this state needs a direct write. If someone
-- does, the way out is real: the compose list keys on the clause, so unticking
-- removes one of the two rows and the box comes back ticked on the other —
-- untick again and the clause is clear, then retick it to take the current
-- wording. Say that, rather than leaving them holding a draft that will not
-- publish and a dialog showing one tidy checkbox.
create or replace function public.publish_document_version(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v public.document_versions; dupe text;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select * into v from public.document_versions where id = p_id for update;
  if not found then raise exception 'no such version'; end if;
  if v.status = 'published' then raise exception 'that version is already the standing one'; end if;
  if v.status = 'retired' then
    raise exception 'that version is retired — copy it into a fresh draft to bring it back';
  end if;
  if v.status <> 'draft' then raise exception 'only a draft can be published'; end if;
  if not exists (select 1 from public.document_clauses where document_version_id = p_id) then
    raise exception 'a document with no clauses says nothing';
  end if;

  /* Deliberately not the word "retired": the action maps that to the version
     copy, and a clause and a version go out of service for different reasons. */
  if exists (
    select 1
    from public.document_clauses dc
    join public.clause_versions cv on cv.id = dc.clause_version_id
    join public.clauses c on c.code = cv.clause_code
    where dc.document_version_id = p_id and not c.active
  ) then
    raise exception 'a clause that is out of use cannot be published into a document';
  end if;

  select cv.clause_code into dupe
  from public.document_clauses dc
  join public.clause_versions cv on cv.id = dc.clause_version_id
  where dc.document_version_id = p_id
  group by cv.clause_code
  having count(*) > 1
  limit 1;

  if dupe is not null then
    raise exception
      'this draft carries % at more than one version — a clause says its piece once. Untick it until the box clears, then tick it again to take the current wording.', dupe;
  end if;

  update public.document_versions set status = 'retired'
  where document_code = v.document_code and status = 'published';

  update public.document_versions
  set status = 'published', effective_from = now(), published_at = now(), published_by = auth.uid()
  where id = p_id;
end;
$$;;
