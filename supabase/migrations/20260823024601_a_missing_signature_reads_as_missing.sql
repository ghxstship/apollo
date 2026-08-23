-- redact_signature raised one message for two different situations, so a
-- mistyped or stale id came back as "already redacted" — telling the operator a
-- signature that does not exist has been dealt with, on the one screen whose
-- whole purpose is an exact record.
create or replace function public.redact_signature(p_id uuid, p_reason text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_redacted timestamptz; v_exists boolean;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select true, redacted_at into v_exists, v_redacted
  from public.signatures where id = p_id;

  if v_exists is null then
    raise exception 'no signature under that id';
  end if;
  if v_redacted is not null then
    raise exception 'signature is already redacted';
  end if;

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
end;
$function$;
