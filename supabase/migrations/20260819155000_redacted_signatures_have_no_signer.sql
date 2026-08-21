-- Two rules in this schema contradicted each other.
--
-- `a_signature_has_a_signer` requires a profile, a guest, or an email. And
-- `signatures.guest_id` is ON DELETE SET NULL, so removing a guest row clears
-- the link. For an ordinary guest signature that is fine — the name and the
-- rendered body still identify the signer. For a REDACTED one it is not: every
-- other identifying column is already null by design, so clearing the last one
-- leaves a row the constraint refuses, and the guest becomes undeletable with a
-- confusing error from a table nobody was touching.
--
-- Redaction is precisely the state where a signature has no signer. The
-- constraint should say so.

alter table public.signatures
  drop constraint if exists a_signature_has_a_signer;

alter table public.signatures
  add constraint a_signature_has_a_signer check (
    redacted_at is not null
    or profile_id is not null
    or guest_id is not null
    or signer_email is not null
  );

comment on constraint a_signature_has_a_signer on public.signatures is
  'Every signature identifies its signer — except a redacted one, where removing the person is the whole point.';
