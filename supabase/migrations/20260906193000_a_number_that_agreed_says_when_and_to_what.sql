-- "phone_verified = true" is not proof of consent, and under the TCPA the
-- burden of proving prior express consent is on the sender.
--
-- The only artefact the club had was a boolean, set by verify_member_phone --
-- a staff-only function whose stated basis is that "crew verify a number they
-- have called or seen answered". That establishes the number reaches a person.
-- It establishes nothing at all about whether that person agreed to be texted,
-- when they agreed, or to what words.
--
-- The product already knows how to do this properly and does it for signatures:
-- the version, a hash of the body actually rendered, the address, the agent and
-- the moment. The consent ledger built this morning carries the same shape and
-- already holds the two subjects this needs. Verifying a number now writes to
-- it, with source 'staff' and a note saying so -- which is a WEAKER record than
-- a member ticking a box themselves, and it says so in the row rather than
-- quietly passing for the strong kind.
--
-- Currently latent: zero texts have ever been sent. It stops being latent on
-- the first send, which is the right time to have already done this.

create or replace function public.verify_member_phone(p_profile uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_version integer; v_body text;
begin
  if not public.is_staff() then
    raise exception 'a number is verified from the Bridge';
  end if;
  if not exists (select 1 from public.profiles
                 where id = p_profile and coalesce(btrim(phone), '') <> '') then
    raise exception 'there is no number on file to verify — the member adds one on their You page first';
  end if;
  perform set_config('app.verify_phone', 'on', true);
  update public.profiles set phone_verified = true where id = p_profile;
  perform set_config('app.verify_phone', 'off', true);

  /* The record, not the boolean. record_consent() writes for auth.uid(), which
     here is the OPERATOR rather than the member — so the row is written
     directly, against the member, with the operator named in the note. That is
     the honest shape: somebody attested on somebody else's behalf, and a
     regulator reading this should be able to see that it was an attestation
     and not a click.

     Transactional only. An operator confirming a number reaches a person is
     not that person agreeing to marketing, and writing a marketing_sms grant
     here would be manufacturing consent nobody gave. */
  select t.version, t.body into v_version, v_body
    from public.consent_texts t
   where t.subject = 'transactional_sms' and t.effective_from <= now()
   order by t.version desc limit 1;

  if v_version is not null then
    insert into public.consent_records
      (profile_id, subject, granted, text_version, text_body, source, note)
    values
      (p_profile, 'transactional_sms', true, v_version, v_body, 'staff',
       'Number verified from the Bridge by ' || coalesce(auth.uid()::text, 'an operator')
         || '. An attestation that the number answers, not a click by the member.');
  end if;
end $fn$;

revoke all on function public.verify_member_phone(uuid) from public, anon;
grant execute on function public.verify_member_phone(uuid) to authenticated;

comment on function public.verify_member_phone(uuid) is
  'Marks a member''s number as verified and writes the consent record that goes with it. Records transactional_sms only, with source ''staff'' and the operator named: an operator confirming a number answers is not the member agreeing to marketing, and writing a marketing grant here would be manufacturing consent nobody gave.';

notify pgrst, 'reload schema';
