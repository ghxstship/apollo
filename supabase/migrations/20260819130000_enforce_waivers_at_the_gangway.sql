-- Enforcement. A waiver system that does not stop anybody is decoration.
--
-- The gate goes at check-in rather than at booking, which is where the waiver
-- industry puts it and where it belongs: a pass is a reservation, and nothing
-- about reserving one is dangerous. Boarding is the moment the risk attaches, so
-- boarding is the moment the signature has to exist. It also means a member can
-- claim a pass in January and sign in June, and that somebody who arrives at the
-- dock unsigned is handed a link rather than turned away — which is exactly the
-- kiosk flow the waiver platforms are built around.
--
-- document_requirements says which document gates what. The gates that bite:
--   board_sea / board_shore — a member checking in to a sailing of that class
--   guest_board             — a named guest checking in

create or replace function public.require_signature_at_check_in()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v      record;
  gate   text;
  needed text;
begin
  -- Only the moment of check-in, and only when it is being set.
  if new.checked_in_at is null or old.checked_in_at is not null then
    return new;
  end if;

  select class into v from public.voyages where id = new.voyage_id;
  gate := case when v.class = 'sea' then 'board_sea' else 'board_shore' end;

  select d.title into needed
  from public.document_requirements dr
  join public.documents d on d.code = dr.document_code and d.active
  where dr.gate = gate
    and not exists (
      select 1
      from public.document_versions dv
      join public.signatures s
        on s.document_version_id = dv.id and s.profile_id = new.profile_id
      where dv.document_code = d.code
        and dv.status = 'published'
        and (d.validity_months is null
             or s.signed_at + make_interval(months => d.validity_months) > now())
    )
  limit 1;

  if needed is not null then
    raise exception 'nobody boards unsigned — % is outstanding', needed
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists rsvp_requires_signature on public.rsvps;
create trigger rsvp_requires_signature
before update of checked_in_at on public.rsvps
for each row execute function public.require_signature_at_check_in();

-- The same line for a named guest. Their waiver is per sailing, so there is no
-- validity window to check — the signature exists for this guest or it does not.
create or replace function public.require_guest_signature_at_check_in()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  needed text;
begin
  if new.checked_in_at is null or old.checked_in_at is not null then
    return new;
  end if;

  select d.title into needed
  from public.document_requirements dr
  join public.documents d on d.code = dr.document_code and d.active
  where dr.gate = 'guest_board'
    and not exists (
      select 1
      from public.document_versions dv
      join public.signatures s
        on s.document_version_id = dv.id and s.guest_id = new.id
      where dv.document_code = d.code and dv.status = 'published'
    )
  limit 1;

  if needed is not null then
    raise exception 'no guest boards unsigned — % is outstanding', needed
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists guest_requires_signature on public.rsvp_guests;
create trigger guest_requires_signature
before update of checked_in_at on public.rsvp_guests
for each row execute function public.require_guest_signature_at_check_in();

revoke execute on function public.require_signature_at_check_in() from public, anon, authenticated;
revoke execute on function public.require_guest_signature_at_check_in() from public, anon, authenticated;

-- Demo members already hold passes on sailings that have completed; back-signing
-- them keeps the seeded history coherent with a rule that now exists. Real
-- members sign for themselves.
do $$
declare
  m       record;
  ver     uuid;
  body    text;
begin
  ver := (select id from public.document_versions
          where document_code = 'member-waiver' and status = 'published');
  if ver is null then return; end if;

  body := (select string_agg(cv.body, E'\n\n' order by dc.position, cv.clause_code)
           from public.document_clauses dc
           join public.clause_versions cv on cv.id = dc.clause_version_id
           where dc.document_version_id = ver
             and '{"class":"sea"}'::jsonb @> dc.condition);

  for m in
    select distinct p.id, p.full_name, p.email
    from public.profiles p
    join public.rsvps r on r.profile_id = p.id
    where p.email like '%demo.lyre.social' or p.email = 'skipper@lyre.social'
  loop
    insert into public.signatures (
      document_version_id, profile_id, signer_name, signer_email,
      rendered_body, rendered_hash, consent_esign, consent_text,
      signature_kind, signature_data, signed_at
    )
    values (
      ver, m.id, m.full_name, m.email,
      body, encode(extensions.digest(body, 'sha256'), 'hex'), true,
      'Signed on joining, kept with the record.',
      'typed', m.full_name, now() - interval '30 days'
    )
    on conflict (document_version_id, profile_id, guest_id) do nothing;
  end loop;
end;
$$;
