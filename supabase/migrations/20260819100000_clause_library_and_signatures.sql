-- Waivers and contracts, assembled from a modular clause library.
--
-- The design tension: modularity and enforceability pull against each other. The
-- moment an admin can edit clause language, "what did this person actually agree
-- to?" stops being answerable — and that question is the whole value of a waiver.
--
-- One rule resolves it: a clause version is immutable once published, a document
-- version is a composition of clause VERSIONS, and a signature binds to a hash of
-- the text that was actually rendered. Editing never mutates; it publishes n+1.
--
-- Normal form. Every table is 3NF: no column is derivable from another non-key
-- column. Two decisions worth stating because they look like exceptions:
--
--   * signatures.rendered_body / rendered_hash are NOT derived data. Assembly
--     depends on a runtime context (a Sea Day pulls clauses a Port Day does not),
--     so the rendered text is not a function of document_version_id alone — it is
--     a fact about the signing event. ESIGN/UETA require the record be
--     reproducible; a hash of something you cannot reproduce proves nothing.
--   * signatures carries no voyage_id. For a guest the sailing is reachable as
--     guest -> rsvp -> voyage, and storing it alongside guest_id would be exactly
--     the transitive dependency 3NF forbids. Members sign standing documents, so
--     there is no sailing to record. The register resolves it in a view.

-- ===== 1. The clause library =================================================

create table if not exists public.clauses (
  code       text primary key,
  title      text not null,
  category   text not null check (category in
               ('liability', 'conduct', 'media', 'privacy', 'payment', 'crew', 'general')),
  position   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.clauses is
  'The clause catalogue. Identity and category only — the words live in clause_versions.';

create table if not exists public.clause_versions (
  id           uuid primary key default gen_random_uuid(),
  clause_code  text not null references public.clauses (code) on delete restrict,
  version      integer not null check (version > 0),
  body         text not null check (length(btrim(body)) > 0),
  note         text,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  unique (clause_code, version)
);

comment on table public.clause_versions is
  'Immutable. A change to wording publishes the next version; prior signatures keep pointing at what they pointed at.';

create index if not exists clause_versions_code_idx on public.clause_versions (clause_code, version desc);

-- ===== 2. Documents as compositions ==========================================

create table if not exists public.documents (
  code            text primary key,
  title           text not null,
  kind            text not null check (kind in ('waiver', 'contract', 'policy')),
  audience        text not null check (audience in ('member', 'guest', 'crew', 'partner')),
  -- null = no expiry. Smartwaiver's model: a waiver may lapse on a period.
  validity_months integer check (validity_months is null or validity_months > 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.document_versions (
  id             uuid primary key default gen_random_uuid(),
  document_code  text not null references public.documents (code) on delete restrict,
  version        integer not null check (version > 0),
  status         text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  effective_from timestamptz,
  published_at   timestamptz,
  published_by   uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (document_code, version),
  constraint published_has_a_date
    check (status <> 'published' or (effective_from is not null and published_at is not null))
);

-- Only one version of a document may be published at a time.
create unique index if not exists document_one_published
  on public.document_versions (document_code) where status = 'published';

create table if not exists public.document_clauses (
  document_version_id uuid not null references public.document_versions (id) on delete cascade,
  clause_version_id   uuid not null references public.clause_versions (id) on delete restrict,
  position            integer not null,
  -- Conditional assembly, in the shape PandaDoc calls Smart Content: a clause is
  -- included when the render context contains this object. {} means always.
  condition           jsonb not null default '{}'::jsonb,
  primary key (document_version_id, clause_version_id)
);

comment on column public.document_clauses.condition is
  'Included when the render context @> this object. {"class":"sea"} puts a clause on Sea Days only.';

-- ===== 3. What a document is required for ====================================

create table if not exists public.document_requirements (
  document_code text not null references public.documents (code) on delete cascade,
  gate          text not null check (gate in
                  ('join_club', 'board_sea', 'board_shore', 'guest_board', 'crew_engage')),
  primary key (document_code, gate)
);

-- ===== 4. Signatures =========================================================

create table if not exists public.signatures (
  id                  uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions (id) on delete restrict,
  profile_id          uuid references public.profiles (id) on delete set null,
  guest_id            uuid references public.rsvp_guests (id) on delete set null,

  -- Captured for attribution. ESIGN/UETA do not set an identity standard; they
  -- require the signature be attributable, which is what these are for.
  signer_name         text,
  signer_email        text,
  guardian_name       text,

  rendered_body       text,
  rendered_hash       text not null check (rendered_hash ~ '^[0-9a-f]{64}$'),

  consent_esign       boolean not null,
  consent_text        text,
  signature_kind      text not null check (signature_kind in ('typed', 'drawn')),
  signature_data      text,

  signed_at           timestamptz not null default now(),
  signed_ip           inet,
  user_agent          text,

  -- GDPR Art 17(3)(e): erasure does not apply where retention is needed to
  -- establish or defend legal claims. Redaction removes the person and keeps the
  -- proof — who is gone, what was agreed and when is not.
  redacted_at         timestamptz,
  redacted_by         uuid references public.profiles (id) on delete set null,

  constraint a_signature_has_a_signer
    check (profile_id is not null or guest_id is not null or signer_email is not null),
  constraint one_signature_per_signer_per_version
    unique nulls not distinct (document_version_id, profile_id, guest_id)
);

create index if not exists signatures_profile_idx on public.signatures (profile_id, signed_at desc);
create index if not exists signatures_guest_idx on public.signatures (guest_id);
create index if not exists signatures_version_idx on public.signatures (document_version_id);

-- A guest signs through a link, so they need a credential that is not the
-- boarding code — that one gets printed on a stub and scanned at the gangway.
alter table public.rsvp_guests
  add column if not exists sign_token uuid not null default gen_random_uuid();

create unique index if not exists rsvp_guests_sign_token on public.rsvp_guests (sign_token);

-- ===== 5. Immutability =======================================================

-- Append-only. Without this the clause library is a place where history quietly
-- changes, which is the failure mode the whole design exists to prevent.
create or replace function public.forbid_rewriting_the_record()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only — publish a new version instead', tg_table_name;
end;
$$;

drop trigger if exists clause_versions_are_immutable on public.clause_versions;
create trigger clause_versions_are_immutable
before update or delete on public.clause_versions
for each row execute function public.forbid_rewriting_the_record();

-- A document version may only move draft -> published -> retired, and its clause
-- list is frozen the moment it publishes.
create or replace function public.guard_document_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'a published document version is a matter of record';
    end if;
    return old;
  end if;
  if old.status = 'retired' then
    raise exception 'a retired version stays retired';
  end if;
  if old.status = 'published' and new.status = 'draft' then
    raise exception 'a published version cannot return to draft';
  end if;
  return new;
end;
$$;

drop trigger if exists document_versions_move_forward on public.document_versions;
create trigger document_versions_move_forward
before update or delete on public.document_versions
for each row execute function public.guard_document_version();

create or replace function public.guard_document_clauses()
returns trigger
language plpgsql
as $$
declare
  parent text;
begin
  select status into parent from public.document_versions
  where id = coalesce(new.document_version_id, old.document_version_id);
  if parent is distinct from 'draft' then
    raise exception 'the clauses of a published document are fixed';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists document_clauses_only_while_draft on public.document_clauses;
create trigger document_clauses_only_while_draft
before insert or update or delete on public.document_clauses
for each row execute function public.guard_document_clauses();

-- A signature may never be edited. The one permitted change is redaction, and
-- redaction may only remove the person — never the proof.
create or replace function public.guard_signature()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'a signature is a matter of record; redact it instead';
  end if;
  if new.document_version_id is distinct from old.document_version_id
     or new.rendered_hash is distinct from old.rendered_hash
     or new.signed_at is distinct from old.signed_at
     or new.consent_esign is distinct from old.consent_esign then
    raise exception 'what was signed, and when, cannot be restated';
  end if;
  return new;
end;
$$;

drop trigger if exists signatures_are_a_record on public.signatures;
create trigger signatures_are_a_record
before update or delete on public.signatures
for each row execute function public.guard_signature();

revoke execute on function public.forbid_rewriting_the_record() from public, anon, authenticated;
revoke execute on function public.guard_document_version() from public, anon, authenticated;
revoke execute on function public.guard_document_clauses() from public, anon, authenticated;
revoke execute on function public.guard_signature() from public, anon, authenticated;
