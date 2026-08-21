-- Counter-signature. A waiver is one-way — you accept terms the club sets. A
-- contract is not: a crew engagement or a partner agreement binds the club too,
-- and a contract only the other side has signed is an offer, not an agreement.
--
-- Rather than widen `signatures` with a nullable "club side" that is meaningless
-- for the ninety percent of rows that are waivers, the counter-signature is its
-- own row against the same signing. 3NF: one fact, one place — a counter-signature
-- is a distinct act by a distinct person at a distinct time.

create table if not exists public.counter_signatures (
  signature_id    uuid primary key references public.signatures (id) on delete restrict,
  signed_by       uuid not null references public.profiles (id) on delete restrict,
  signer_name     text not null,
  signer_title    text,
  signed_at       timestamptz not null default now(),
  signed_ip       inet,
  user_agent      text
);

comment on table public.counter_signatures is
  'The club''s side of a two-party contract. One per signature, and only for documents of kind contract.';

create index if not exists counter_signatures_by_idx on public.counter_signatures (signed_by);

alter table public.counter_signatures enable row level security;

-- Readable by the person whose contract it is, and by staff. Written only
-- through the RPC, so there is no INSERT policy.
create policy "own or staff counter-signatures" on public.counter_signatures
  for select to authenticated using (
    public.is_staff()
    or exists (
      select 1 from public.signatures s
      where s.id = signature_id and s.profile_id = auth.uid()
    )
  );

revoke insert, update, delete on public.counter_signatures from anon;

-- A counter-signature is as much a record as the signature it answers.
create or replace function public.guard_counter_signature()
returns trigger
language plpgsql
as $$
begin
  raise exception 'a counter-signature is a matter of record';
end;
$$;

drop trigger if exists counter_signatures_are_a_record on public.counter_signatures;
create trigger counter_signatures_are_a_record
before update or delete on public.counter_signatures
for each row execute function public.guard_counter_signature();

revoke execute on function public.guard_counter_signature() from public, anon, authenticated;

create or replace function public.counter_sign(
  p_signature_id uuid,
  p_title        text default null,
  p_user_agent   text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  me   uuid := auth.uid();
  kind text;
  who  text;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select d.kind into kind
  from public.signatures s
  join public.document_versions dv on dv.id = s.document_version_id
  join public.documents d on d.code = dv.document_code
  where s.id = p_signature_id;

  if kind is null then raise exception 'no such signature'; end if;
  if kind <> 'contract' then
    raise exception 'a waiver is one-way; only a contract is counter-signed';
  end if;
  if exists (select 1 from public.counter_signatures where signature_id = p_signature_id) then
    raise exception 'that contract is already counter-signed';
  end if;

  select full_name into who from public.profiles where id = me;

  insert into public.counter_signatures (
    signature_id, signed_by, signer_name, signer_title, signed_ip, user_agent
  ) values (
    p_signature_id, me, coalesce(who, 'For the club'), nullif(btrim(coalesce(p_title, '')), ''),
    public.request_ip(), p_user_agent
  );

  -- Tell the other party their agreement is now an agreement.
  insert into public.notifications (profile_id, kind, title, body)
  select s.profile_id, 'word', 'Counter-signed — ' || d.title,
         'The club has signed its side. The agreement is in force and a copy is with your record.'
  from public.signatures s
  join public.document_versions dv on dv.id = s.document_version_id
  join public.documents d on d.code = dv.document_code
  where s.id = p_signature_id and s.profile_id is not null;

  return p_signature_id;
end;
$$;

revoke execute on function public.counter_sign(uuid, text, text) from public, anon;
grant execute on function public.counter_sign(uuid, text, text) to authenticated;

-- A contract in force is one both sides have signed. Waivers stand alone.
create or replace view public.agreement_standing
with (security_invoker = on) as
select
  s.id                as signature_id,
  s.profile_id,
  d.code              as document_code,
  d.title,
  d.kind,
  s.signed_at,
  cs.signed_at        as counter_signed_at,
  cs.signer_name      as counter_signed_by,
  case
    when d.kind <> 'contract' then true
    else cs.signature_id is not null
  end                 as in_force
from public.signatures s
join public.document_versions dv on dv.id = s.document_version_id
join public.documents d on d.code = dv.document_code
left join public.counter_signatures cs on cs.signature_id = s.id;

grant select on public.agreement_standing to authenticated;

comment on view public.agreement_standing is
  'A waiver stands on one signature; a contract stands only once the club has counter-signed.';
