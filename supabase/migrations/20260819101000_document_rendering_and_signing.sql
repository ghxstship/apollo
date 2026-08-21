-- Rendering, signing, and the compliance surface around both.
--
-- Everything that matters legally is computed server-side. A hash the client
-- supplies proves only that the client said so; the point of the hash is that
-- the server can state what it rendered.

-- ===== Rendering =============================================================

-- Assemble a document version for a context. A clause is included when the
-- context contains its condition, so {} is always and {"class":"sea"} is a Sea
-- Day. Ordering is explicit, never incidental.
create or replace function public.render_document(
  p_document_version_id uuid,
  p_context jsonb default '{}'::jsonb
)
returns text
language sql stable security definer set search_path = public
as $$
  select string_agg(cv.body, E'\n\n' order by dc.position, cv.clause_code)
  from public.document_clauses dc
  join public.clause_versions cv on cv.id = dc.clause_version_id
  where dc.document_version_id = p_document_version_id
    and p_context @> dc.condition;
$$;

revoke execute on function public.render_document(uuid, jsonb) from public, anon;
grant execute on function public.render_document(uuid, jsonb) to authenticated;

create or replace function public.published_version(p_document_code text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.document_versions
  where document_code = p_document_code and status = 'published'
  limit 1;
$$;

revoke execute on function public.published_version(text) from public, anon;
grant execute on function public.published_version(text) to authenticated;

-- ===== Publishing ============================================================

create or replace function public.publish_document_version(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v public.document_versions;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select * into v from public.document_versions where id = p_id for update;
  if not found then raise exception 'no such version'; end if;
  if v.status <> 'draft' then raise exception 'only a draft can be published'; end if;
  if not exists (select 1 from public.document_clauses where document_version_id = p_id) then
    raise exception 'a document with no clauses says nothing';
  end if;

  -- Retire the standing version first: one published version per document.
  update public.document_versions
  set status = 'retired'
  where document_code = v.document_code and status = 'published';

  update public.document_versions
  set status = 'published', effective_from = now(), published_at = now(), published_by = auth.uid()
  where id = p_id;
end;
$$;

revoke execute on function public.publish_document_version(uuid) from public, anon;
grant execute on function public.publish_document_version(uuid) to authenticated;

-- ===== Signing ===============================================================

-- The request headers PostgREST forwards. Used for attribution only.
create or replace function public.request_ip()
returns inet
language plpgsql stable security definer set search_path = public
as $$
declare
  raw text;
begin
  raw := split_part(
    coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1);
  if raw is null or btrim(raw) = '' then return null; end if;
  return btrim(raw)::inet;
exception when others then
  return null;
end;
$$;

revoke execute on function public.request_ip() from public, anon, authenticated;

/* Sign as a member.

   Captures the ESIGN/UETA audit trail: the rendered text and its SHA-256, an
   explicit record of consent to transact electronically together with the words
   consented to, the signature itself, server time, IP and user agent. Re-signing
   the same version is idempotent rather than an error — a member who taps twice
   has not signed twice. */
create or replace function public.sign_document(
  p_document_code  text,
  p_context        jsonb default '{}'::jsonb,
  p_consent        boolean default false,
  p_consent_text   text default null,
  p_signature_kind text default 'typed',
  p_signature_data text default null,
  p_signer_name    text default null,
  p_user_agent     text default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  me       uuid := auth.uid();
  ver      uuid;
  body     text;
  sig_id   uuid;
  who      text;
  mail     text;
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
$$;

revoke execute on function public.sign_document(text, jsonb, boolean, text, text, text, text, text)
  from public, anon;
grant execute on function public.sign_document(text, jsonb, boolean, text, text, text, text, text)
  to authenticated;

/* Sign as a guest, by token.

   A guest has no account and never will — they came aboard once with somebody.
   The token on their row is the whole credential, exactly as the calendar feed
   works. Anon-callable by design: the alternative is asking a guest to make an
   account to sign a liability waiver, which nobody does.

   The sailing is derived from the guest's own row rather than passed in, so a
   token cannot be pointed at a different voyage's document. */
create or replace function public.sign_document_as_guest(
  p_token          uuid,
  p_document_code  text,
  p_consent        boolean default false,
  p_consent_text   text default null,
  p_signature_kind text default 'typed',
  p_signature_data text default null,
  p_signer_name    text default null,
  p_guardian_name  text default null,
  p_user_agent     text default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  g        record;
  ver      uuid;
  body     text;
  ctx      jsonb;
  sig_id   uuid;
begin
  if not p_consent then
    raise exception 'consent to sign electronically is required';
  end if;
  if p_signature_data is null or btrim(p_signature_data) = '' then
    raise exception 'a signature is required';
  end if;

  select rg.id, rg.name, v.class, v.id as voyage_id
  into g
  from public.rsvp_guests rg
  join public.rsvps r on r.id = rg.rsvp_id
  join public.voyages v on v.id = r.voyage_id
  where rg.sign_token = p_token;

  if not found then raise exception 'that link is not recognised'; end if;

  -- The guest may only sign a guest-audience document, and the context comes
  -- from their sailing rather than from the caller.
  if not exists (
    select 1 from public.documents d
    where d.code = p_document_code and d.audience = 'guest' and d.active
  ) then
    raise exception 'that document is not for guests';
  end if;

  ver := public.published_version(p_document_code);
  if ver is null then raise exception 'that document is not published'; end if;

  ctx := jsonb_build_object('class', g.class);
  body := public.render_document(ver, ctx);
  if body is null or btrim(body) = '' then
    raise exception 'that document renders empty in this context';
  end if;

  insert into public.signatures (
    document_version_id, guest_id, signer_name, guardian_name,
    rendered_body, rendered_hash, consent_esign, consent_text,
    signature_kind, signature_data, signed_ip, user_agent
  ) values (
    ver, g.id,
    coalesce(nullif(btrim(coalesce(p_signer_name, '')), ''), g.name),
    nullif(btrim(coalesce(p_guardian_name, '')), ''),
    body, encode(digest(body, 'sha256'), 'hex'), true, p_consent_text,
    coalesce(p_signature_kind, 'typed'), p_signature_data,
    public.request_ip(), p_user_agent
  )
  on conflict (document_version_id, profile_id, guest_id) do nothing
  returning id into sig_id;

  if sig_id is null then
    select id into sig_id from public.signatures
    where document_version_id = ver and guest_id = g.id;
  end if;

  return sig_id;
end;
$$;

revoke execute on function public.sign_document_as_guest(uuid, text, boolean, text, text, text, text, text, text)
  from public;
grant execute on function public.sign_document_as_guest(uuid, text, boolean, text, text, text, text, text, text)
  to anon, authenticated;

-- What a guest is being asked to sign, before they sign it. Token-scoped, and
-- returns only the words and the sailing — never the roster.
create or replace function public.guest_document(p_token uuid, p_document_code text)
returns table (
  guest_name    text,
  voyage_title  text,
  voyage_starts timestamptz,
  document_title text,
  body          text,
  already_signed boolean
)
language plpgsql stable security definer set search_path = public
as $$
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
$$;

revoke execute on function public.guest_document(uuid, text) from public;
grant execute on function public.guest_document(uuid, text) to anon, authenticated;

-- ===== Standing ==============================================================

/* What a member has signed, what has lapsed, and what was never signed at all.
   A signature stands when it is against the published version and inside the
   validity window; publishing a new version makes prior signatures "out of
   date", which is a different thing from "missing" and reads differently at the
   gangway. */
create or replace function public.signature_standing(p_profile_id uuid)
returns table (
  document_code text,
  title         text,
  kind          text,
  gates         text[],
  state         text,
  signed_at     timestamptz,
  expires_at    timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  if p_profile_id <> auth.uid() and not public.is_staff() then
    raise exception 'not visible';
  end if;

  return query
  select d.code, d.title, d.kind,
         coalesce(array_agg(distinct dr.gate) filter (where dr.gate is not null), '{}'),
         case
           when s.id is null then 'missing'
           when d.validity_months is not null
                and s.signed_at + make_interval(months => d.validity_months) < now() then 'lapsed'
           else 'signed'
         end,
         s.signed_at,
         case when d.validity_months is null then null
              else s.signed_at + make_interval(months => d.validity_months) end
  from public.documents d
  left join public.document_requirements dr on dr.document_code = d.code
  left join public.document_versions dv
         on dv.document_code = d.code and dv.status = 'published'
  left join public.signatures s
         on s.document_version_id = dv.id and s.profile_id = p_profile_id
  where d.active and d.audience = 'member'
  group by d.code, d.title, d.kind, d.validity_months, s.id, s.signed_at
  order by d.code;
end;
$$;

revoke execute on function public.signature_standing(uuid) from public, anon;
grant execute on function public.signature_standing(uuid) to authenticated;

-- ===== Erasure ===============================================================

/* GDPR Art 17(3)(e) / CCPA equivalent: the right to erasure does not reach
   records needed to establish or defend a legal claim, which is exactly what a
   waiver is. Redaction is the correct answer — remove the person, keep the
   proof. What was agreed, when, and the hash that proves it all survive. */
create or replace function public.redact_signature(p_id uuid, p_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  update public.signatures
  set signer_name    = null,
      signer_email   = null,
      guardian_name  = null,
      signature_data = null,
      signed_ip      = null,
      user_agent     = null,
      rendered_body  = null,
      redacted_at    = now(),
      redacted_by    = auth.uid()
  where id = p_id and redacted_at is null;

  if not found then raise exception 'no such signature, or already redacted'; end if;
end;
$$;

revoke execute on function public.redact_signature(uuid, text) from public, anon;
grant execute on function public.redact_signature(uuid, text) to authenticated;
