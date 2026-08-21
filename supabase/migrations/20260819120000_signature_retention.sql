-- Retention. GDPR requires that personal data not be kept indefinitely, and the
-- club's own data-notice clause states the period out loud: the membership
-- record and this agreement are kept while you are a member and for six years
-- afterwards, so that a claim can be answered.
--
-- Six years is the limitation period the retention is set against; a signature
-- older than that has outlived the reason for keeping it.
--
-- The order is redact, then purge. Redaction answers an erasure request while
-- the record is still needed — person out, proof kept. Purge is what happens
-- when even the proof has expired.

create or replace function public.purge_expired_signatures(p_years integer default 6)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  gone integer := 0;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_years < 1 then raise exception 'a retention period is measured in years'; end if;

  -- Redact first: anything past the window still carrying a person loses them.
  update public.signatures
  set signer_name = null, signer_email = null, guardian_name = null,
      signature_data = null, signed_ip = null, user_agent = null,
      rendered_body = null, redacted_at = now(), redacted_by = auth.uid()
  where redacted_at is null
    and signed_at < now() - make_interval(years => p_years);

  -- Then purge what has been redacted and has outlived the window entirely.
  delete from public.signatures
  where redacted_at is not null
    and signed_at < now() - make_interval(years => p_years);
  get diagnostics gone = row_count;

  return gone;
end;
$$;

revoke execute on function public.purge_expired_signatures(integer) from public, anon;
grant execute on function public.purge_expired_signatures(integer) to authenticated;

-- The append-only trigger blocks every delete, including the purge's own. It
-- learns the one exception: a redacted signature, deleted from inside the purge.
create or replace function public.guard_signature()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.redacted_at is not null
       and coalesce(current_setting('app.purging_signatures', true), 'off') = 'on' then
      return old;
    end if;
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

revoke execute on function public.guard_signature() from public, anon, authenticated;

create or replace function public.purge_expired_signatures(p_years integer default 6)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  gone integer := 0;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_years < 1 then raise exception 'a retention period is measured in years'; end if;

  update public.signatures
  set signer_name = null, signer_email = null, guardian_name = null,
      signature_data = null, signed_ip = null, user_agent = null,
      rendered_body = null, redacted_at = now(), redacted_by = auth.uid()
  where redacted_at is null
    and signed_at < now() - make_interval(years => p_years);

  -- Transaction-local, set only here. set_config lives in pg_catalog, which
  -- PostgREST does not expose, so a client cannot raise this flag itself.
  perform set_config('app.purging_signatures', 'on', true);
  delete from public.signatures
  where redacted_at is not null
    and signed_at < now() - make_interval(years => p_years);
  get diagnostics gone = row_count;
  perform set_config('app.purging_signatures', 'off', true);

  return gone;
end;
$$;

revoke execute on function public.purge_expired_signatures(integer) from public, anon;
grant execute on function public.purge_expired_signatures(integer) to authenticated;

comment on function public.purge_expired_signatures(integer) is
  'Retention sweep: redacts anything past the window, then removes what has been redacted and outlived it. Six years by default, matching the data-notice clause.';
