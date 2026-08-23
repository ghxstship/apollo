-- 'only a draft can be published' covered two opposite situations, and the action
-- mapped it to "That version is already published." So an operator trying to roll
-- back to the previous wording was told the RETIRED version is the standing one.
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

  update public.document_versions set status = 'retired'
  where document_code = v.document_code and status = 'published';

  update public.document_versions
  set status = 'published', effective_from = now(), published_at = now(), published_by = auth.uid()
  where id = p_id;
end;
$function$;
