-- Two throwaway documents from earlier hardening rounds — r3-paper and
-- e2e-r2-paper — were left behind with a published version each, and three
-- probe clauses were left active while composing nothing. It looked like tidy-up
-- work. It was not.
--
-- published_version() resolves a code to its standing version without asking
-- whether the document is still in use, and sign_document() reaches the version
-- only through it. So any signed-in member could call
-- sign_document('r3-paper', ...) and put a real, hashed, ESIGN-shaped signature
-- against a retired test fixture — and because signatures.document_version_id
-- is ON DELETE RESTRICT, that signature would then pin the fixture in place
-- permanently. The residue was one RPC call away from becoming a record.
--
-- Every reader that gets this right gets it right on its own: guest_document()
-- tests d.active before resolving, signature_standing() filters d.active in its
-- join, and each page filters again in TypeScript. Four places agreeing by hand
-- is how the fifth comes to disagree. The check belongs in the resolver.
--
-- Nothing here is destructive and nothing is irreversible. The append-only
-- guards are untouched: a published version stays a matter of record, because
-- the moment that rule grows an "unless nothing signed it" branch it starts
-- depending on the signatures table being tamper-proof, which today it does not
-- need to be. The fixtures keep their rows and their status. They simply stop
-- being reachable.

-- ===== 1. Say out loud if the ground has moved ==============================

do $$
declare n integer;
begin
  select count(*) into n
  from public.clause_versions cv
  join public.document_clauses dc on dc.clause_version_id = cv.id
  join public.document_versions dv on dv.id = dc.document_version_id
  join public.documents d on d.code = dv.document_code
  where cv.clause_code in ('audit-probe-clause', 'e2e-harden-clause', 'e2e-r2-clause')
    and d.active;
  if n > 0 then
    raise exception 'a live document composes one of these clauses — not a fixture after all';
  end if;
end $$;

-- ===== 2. The probe clauses go out of use ==================================

-- clauses carries identity, not wording, and has no immutability trigger:
-- active is the retirement the catalogue was built with. The clause_versions
-- rows stay exactly as they are, as they must.
update public.clauses
set active = false
where code in ('audit-probe-clause', 'e2e-harden-clause', 'e2e-r2-clause');

-- ===== 3. A document out of use has no standing version ====================

-- The chokepoint. Every caller — sign_document, guest_document, the member
-- agreement page, the reviewer preview — funnels through here, so this is the
-- one place the question has to be asked. An inactive document now resolves to
-- null, and sign_document's own 'that document is not published' is the refusal
-- the member sees.
create or replace function public.published_version(p_document_code text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select dv.id
  from public.document_versions dv
  join public.documents d on d.code = dv.document_code
  where dv.document_code = p_document_code
    and dv.status = 'published'
    and d.active
  limit 1;
$function$;

-- ===== 4. Stop a withdrawn clause reaching a live document =================

-- A draft that carries a clause the catalogue has withdrawn must not become
-- wording a member is held to. Checked at publish rather than at compose:
-- composing edits a draft, which binds nobody, and an operator who withdraws a
-- clause mid-draft should find out when it matters rather than lose their work.
create or replace function public.publish_document_version(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v public.document_versions;
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

  update public.document_versions set status = 'retired'
  where document_code = v.document_code and status = 'published';

  update public.document_versions
  set status = 'published', effective_from = now(), published_at = now(), published_by = auth.uid()
  where id = p_id;
end;
$function$;;
