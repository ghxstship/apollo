-- require_signature_at_check_in() named a local variable `gate`, which is also
-- the column it compares against, so every check-in raised "column reference
-- gate is ambiguous" instead of applying the rule. Both the signed and unsigned
-- cases failed, which looks like enforcement working and is not.
--
-- Prefixed locals throughout.

create or replace function public.require_signature_at_check_in()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_class  public.event_class;
  v_gate   text;
  v_needed text;
begin
  if new.checked_in_at is null or old.checked_in_at is not null then
    return new;
  end if;

  select class into v_class from public.voyages where id = new.voyage_id;
  v_gate := case when v_class = 'sea' then 'board_sea' else 'board_shore' end;

  select d.title into v_needed
  from public.document_requirements dr
  join public.documents d on d.code = dr.document_code and d.active
  where dr.gate = v_gate
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

  if v_needed is not null then
    raise exception 'nobody boards unsigned — % is outstanding', v_needed
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.require_guest_signature_at_check_in()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_needed text;
begin
  if new.checked_in_at is null or old.checked_in_at is not null then
    return new;
  end if;

  select d.title into v_needed
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

  if v_needed is not null then
    raise exception 'no guest boards unsigned — % is outstanding', v_needed
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke execute on function public.require_signature_at_check_in() from public, anon, authenticated;
revoke execute on function public.require_guest_signature_at_check_in() from public, anon, authenticated;
