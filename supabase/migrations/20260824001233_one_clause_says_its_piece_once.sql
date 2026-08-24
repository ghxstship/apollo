-- Handed to me by apollo-82 as a UI ergonomics gap, and it is bigger than that.
--
-- The compose dialog is keyed on the catalogue's LATEST clause version
-- (`composition.get(c.latestVersionId)`), so a draft holding v1 of a clause
-- that has since been revised to v2 shows that clause as unticked. Tick it and
-- v2 is added ALONGSIDE the orphaned v1 — and nothing stops that:
-- document_clauses' primary key is (document_version_id, clause_version_id),
-- so two versions of one clause are two perfectly legal rows.
--
-- render_document() then does
--   string_agg(cv.body, E'\n\n' order by dc.position, cv.clause_code)
-- over every composed row. So the document renders that clause TWICE, in two
-- different wordings, and sign_document() hashes the pair and stores it as what
-- the member agreed to. That is not an ergonomics gap; it is a contract that
-- says a thing twice and possibly says it differently the second time.
--
-- The UI should also be keyed on the composed version rather than the latest —
-- that is a real fix and it belongs in the dialog. But the UI is not the only
-- writer of document_clauses, and the record is what matters, so the rule goes
-- where publishing happens: a version about to become the standing one may not
-- carry the same clause twice. apollo-82's clause-active check sits directly
-- above this one and joins the same three tables on the composed version, which
-- is why this reads as a sibling of it.
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

  -- The same clause at two versions renders twice, in two wordings, and the
  -- signature hashes both as one agreement.
  select cv.clause_code into dupe
  from public.document_clauses dc
  join public.clause_versions cv on cv.id = dc.clause_version_id
  where dc.document_version_id = p_id
  group by cv.clause_code
  having count(*) > 1
  limit 1;

  if dupe is not null then
    raise exception 'this draft carries % at more than one version — a clause says its piece once', dupe;
  end if;

  update public.document_versions set status = 'retired'
  where document_code = v.document_code and status = 'published';

  update public.document_versions
  set status = 'published', effective_from = now(), published_at = now(), published_by = auth.uid()
  where id = p_id;
end;
$$;;
