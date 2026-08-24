-- The other half of the hole apollo-82 closed in published_version(): that
-- resolver now refuses a document whose `active` is false, and sign_document()
-- still never asks about `audience`. So any signed-in member could call
-- sign_document('crew-agreement', …) or ('guest-waiver', …) and get a real
-- hashed ESIGN signature row against papers that are not theirs to sign.
--
-- Where the checks live today, which is the whole point:
--   /agreements/[code]/page.tsx  — 404s unless d.audience = 'member'
--   signature_standing()         — `where d.active and d.audience = 'member'`
--   guest_document()             — `d.audience = 'guest' and d.active`
--   published_version()          — d.active (theirs, just landed)
--   sign_document()              — neither, and it is the one that WRITES
-- Five hand-written implementations of one rule; the one that makes a record
-- was the one that had it least. And signatures.document_version_id is
-- ON DELETE RESTRICT, so a signature against the wrong paper pins that version
-- in the database for good.
--
-- crew_engage is declared in document_requirements and read by nothing today,
-- so this is not live privilege escalation — it is a false record, and a gate
-- pre-loaded for whoever implements crew standing later. Enumerated before
-- deciding: nothing in src/ or the e2e suite signs anything but member-waiver
-- and membership-agreement through this path, and guests have their own
-- resolver, so restricting this one to member papers breaks no real flow. If a
-- crew signing flow is ever added it gets its own path, exactly as guests did.
create or replace function public.sign_document(
  p_document_code text,
  p_context jsonb default '{}'::jsonb,
  p_consent boolean default false,
  p_consent_text text default null,
  p_signature_kind text default 'typed',
  p_signature_data text default null,
  p_signer_name text default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  me       uuid := auth.uid();
  ver      uuid;
  body     text;
  sig_id   uuid;
  who      text;
  mail     text;
  aud      text;
begin
  if me is null then raise exception 'sign in required'; end if;
  if not p_consent then
    raise exception 'consent to sign electronically is required';
  end if;
  if p_signature_kind not in ('typed', 'drawn') then
    raise exception 'a signature is typed or drawn';
  end if;
  if p_signature_data is null or btrim(p_signature_data) = '' then
    raise exception 'a signature is required';
  end if;

  -- Whose paper this is, asked once, before anything is written.
  select d.audience into aud from public.documents d where d.code = p_document_code;
  if aud is null then raise exception 'that document is not published'; end if;
  if aud <> 'member' then
    raise exception 'that paper is not yours to sign';
  end if;

  ver := public.published_version(p_document_code);
  if ver is null then raise exception 'that document is not published'; end if;

  body := public.render_document(ver, coalesce(p_context, '{}'::jsonb));
  if body is null or btrim(body) = '' then
    raise exception 'that document renders empty in this context';
  end if;

  select coalesce(nullif(btrim(coalesce(p_signer_name, '')), ''), p.full_name), p.email
  into who, mail
  from public.profiles p where p.id = me;

  insert into public.signatures (
    document_version_id, profile_id, signer_name, signer_email,
    rendered_body, rendered_hash, consent_esign, consent_text,
    signature_kind, signature_data, signed_ip, user_agent
  ) values (
    ver, me, who, mail,
    body, encode(digest(body, 'sha256'), 'hex'), true, p_consent_text,
    p_signature_kind, p_signature_data, public.request_ip(), p_user_agent
  )
  on conflict (document_version_id, profile_id, guest_id) do nothing
  returning id into sig_id;

  if sig_id is null then
    select id into sig_id from public.signatures
    where document_version_id = ver and profile_id = me and guest_id is null;
  end if;

  return sig_id;
end;
$function$;

revoke execute on function public.sign_document(text, jsonb, boolean, text, text, text, text, text) from public, anon;
grant execute on function public.sign_document(text, jsonb, boolean, text, text, text, text, text) to authenticated;;
