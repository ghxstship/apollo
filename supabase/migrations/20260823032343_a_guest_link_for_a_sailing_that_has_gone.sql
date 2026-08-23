-- A guest token is a permanent bearer link with no relation to the sailing's
-- state, so /sign/<token> for a voyage that sailed weeks ago still read "sign
-- before you come down to the dock" and would record a new binding signature.
drop function if exists public.guest_document(uuid, text);

create or replace function public.guest_document(p_token uuid, p_document_code text)
returns table(guest_name text, voyage_title text, voyage_starts timestamptz,
              document_title text, body text, already_signed boolean,
              voyage_state text)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  g   record;
  ver uuid;
  v_state text;
begin
  select rg.id, rg.name, v.class, v.title, v.starts_at, v.status::text as vstatus
  into g
  from public.rsvp_guests rg
  join public.rsvps r on r.id = rg.rsvp_id
  join public.voyages v on v.id = r.voyage_id
  where rg.sign_token = p_token;
  if not found then return; end if;

  if not exists (
    select 1 from public.documents d
    where d.code = p_document_code and d.audience = 'guest' and d.active
  ) then
    return;
  end if;

  ver := public.published_version(p_document_code);
  if ver is null then return; end if;

  v_state := case
    when g.vstatus = 'cancelled' then 'cancelled'
    when g.vstatus = 'completed' or g.starts_at <= now() then 'sailed'
    else 'ahead'
  end;

  return query
  select g.name, g.title, g.starts_at,
         d.title,
         public.render_document(ver, jsonb_build_object('class', g.class)),
         exists (select 1 from public.signatures s
                 where s.document_version_id = ver and s.guest_id = g.id),
         v_state
  from public.documents d where d.code = p_document_code;
end;
$function$;

revoke execute on function public.guest_document(uuid, text) from public;
grant execute on function public.guest_document(uuid, text) to anon, authenticated;

create or replace function public.guest_may_still_sign(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.rsvp_guests rg
    join public.rsvps r on r.id = rg.rsvp_id
    join public.voyages v on v.id = r.voyage_id
    where rg.sign_token = p_token
      and v.status not in ('cancelled', 'completed')
      and v.starts_at > now()
  );
$$;

revoke execute on function public.guest_may_still_sign(uuid) from public;
grant execute on function public.guest_may_still_sign(uuid) to anon, authenticated;
