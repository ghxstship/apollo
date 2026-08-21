-- Second pass at the same constraint. A guest signature identifies its signer by
-- NAME — guests give no email, because the club never asked them for one and
-- data minimisation says do not start now. So clearing guest_id on delete left a
-- row carrying a perfectly good signer that the constraint did not recognise.
--
-- The rule is: a signature must identify its signer by something. A profile, a
-- guest row, a name, or an address. Unless it has been redacted, in which case
-- identifying nobody is the point.

alter table public.signatures
  drop constraint if exists a_signature_has_a_signer;

alter table public.signatures
  add constraint a_signature_has_a_signer check (
    redacted_at is not null
    or profile_id is not null
    or guest_id is not null
    or signer_name is not null
    or signer_email is not null
  );

comment on constraint a_signature_has_a_signer on public.signatures is
  'A signature identifies its signer by profile, guest, name or address — except a redacted one, where identifying nobody is the point.';
