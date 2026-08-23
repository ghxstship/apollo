-- guest_document() took any document code and rendered any published version,
-- so an anonymous holder of one guest token could read the full text of the
-- member waiver, the membership agreement, and the crew engagement agreement.
-- Its sibling sign_document_as_guest already refuses a non-guest document
-- ("that document is not for guests"); the reader now matches the writer, and
-- the function keeps its stated contract — only the words and the sailing.
create or replace function public.guest_document(p_token uuid, p_document_code text)
returns table(guest_name text, voyage_title text, voyage_starts timestamptz,
              document_title text, body text, already_signed boolean)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  g   record;
  ver uuid;
begin
  select rg.id, rg.name, v.class, v.title, v.starts_at
  into g
  from public.rsvp_guests rg
  join public.rsvps r on r.id = rg.rsvp_id
  join public.voyages v on v.id = r.voyage_id
  where rg.sign_token = p_token;
  if not found then return; end if;

  -- A guest token opens guest paper only.
  if not exists (
    select 1 from public.documents d
    where d.code = p_document_code and d.audience = 'guest' and d.active
  ) then
    return;
  end if;

  ver := public.published_version(p_document_code);
  if ver is null then return; end if;

  return query
  select g.name, g.title, g.starts_at,
         d.title,
         public.render_document(ver, jsonb_build_object('class', g.class)),
         exists (select 1 from public.signatures s
                 where s.document_version_id = ver and s.guest_id = g.id)
  from public.documents d where d.code = p_document_code;
end;
$function$;
