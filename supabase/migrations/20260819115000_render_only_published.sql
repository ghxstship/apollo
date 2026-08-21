-- render_document() is SECURITY DEFINER, so it reads past the RLS that keeps
-- drafts staff-only. A member who guessed a draft version id could read wording
-- the club has not published — unreleased terms, visible early.
--
-- Definer is still right: the function has to read clause_versions, which
-- members cannot. The fix is to make the function itself decide what it will
-- render, rather than leaning on a policy it deliberately bypasses.

create or replace function public.render_document(
  p_document_version_id uuid,
  p_context jsonb default '{}'::jsonb
)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  state text;
begin
  select status into state from public.document_versions where id = p_document_version_id;
  if state is null then return null; end if;

  -- A draft is readable by the people drafting it, and by nobody else.
  if state <> 'published' and not public.is_staff() then
    raise exception 'that version is not published';
  end if;

  return (
    select string_agg(cv.body, E'\n\n' order by dc.position, cv.clause_code)
    from public.document_clauses dc
    join public.clause_versions cv on cv.id = dc.clause_version_id
    where dc.document_version_id = p_document_version_id
      and p_context @> dc.condition
  );
end;
$$;

revoke execute on function public.render_document(uuid, jsonb) from public, anon;
grant execute on function public.render_document(uuid, jsonb) to authenticated;

-- render_document is now guarded by is_staff(), which anon cannot execute — so
-- the guest paths must never reach it as anon. They do not: guest_document and
-- sign_document_as_guest are both definer and resolve the published version
-- themselves before rendering, and both run as the function owner. Asserted
-- rather than assumed, by the e2e suite.
