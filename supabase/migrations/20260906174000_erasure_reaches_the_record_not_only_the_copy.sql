-- Erasure anonymised the copy and left the original standing.
--
-- erase_departed_profiles() blanks public.profiles thirty days after somebody
-- departs, and deletes their push subscriptions. That is the copy. The original
-- is auth.users, which keeps the real email, the real telephone number, the
-- password hash and whatever the sign-up put in raw_user_meta_data -- verified
-- live: every profile row has a populated auth.users.email behind it.
--
-- So a member who departed and was "erased" could still be found by their email
-- address, and the club's own farewell letter told them the opposite.
--
-- The operator path that would have cleared it is closed too, and we closed it:
-- a_member_is_anonymised_never_deleted (2026-09-06) put a BEFORE DELETE trigger
-- on profiles, and because profiles.id cascades from auth.users, deleting the
-- auth user now fails 23503. That was the right trigger for the wrong reason to
-- be comfortable -- it made the design honest and the implementation
-- unreachable at the same time.
--
-- The fix is not to delete the auth row. Deleting it would cascade to the
-- profile, which is the thing the club has a legal-records reason to keep, and
-- the trigger correctly refuses. The fix is to blank the auth row IN PLACE, the
-- same way the profile is blanked: the sign-in stops resolving to a person, the
-- foreign key stays intact, and the ledger keeps its figures without anybody
-- attached to them.
--
-- Also swept, because none of it survives the member and all of it is about
-- them: the vetting file, the marks the Bridge wrote, the preference sheet and
-- its boundaries, the saved cards, and every live credential -- wallet tokens
-- and the member QR -- which should not outlive the membership by a month
-- regardless of what anybody is entitled to.
--
-- NOT swept, and each for a stated reason a regulator can be shown:
--   signatures            the signed declaration and who signed it, held
--                         signature_retention_years (6) because that is the
--                         limitation period on the thing it evidences.
--   account_ledger        the figures, held for accounting law. The member is
--                         already detached from them by the blanked profile.
--   messages, open deck   other people's conversations. The author is already
--                         anonymous by reference once the profile is blanked;
--                         rewriting the bodies would edit correspondence that
--                         is not only theirs.
--   audit_log             from today the profile recorder withholds values, so
--                         the lines say which field moved and not what it said.

create or replace function public.erase_departed_profiles()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  n integer := 0;
  m record;
begin
  /* One member at a time in its own subtransaction. This function reaches into
     auth, deletes from eight tables and is run by a scheduled job; a single row
     that will not blank must not leave every other departed member standing.
     The idiom is the one every scheduled job in this schema uses. */
  for m in
    select p.id
      from public.profiles p
     where p.status = 'departed'
       and p.status_set_at is not null
       and p.status_set_at < now() - make_interval(days => public.club_setting('departed_erasure_days'))
       and p.full_name is distinct from 'Departed member'
  loop
    begin
      update public.profiles p
         set full_name = 'Departed member',
             handle = null,
             email = null,
             phone = null,
             phone_verified = false,
             bio = null,
             interests = '{}',
             stripe_customer_id = null,
             in_directory = false,
             on_manifest = false,
             calendar_token = gen_random_uuid(),
             notification_prefs = '{}'::jsonb,
             tax_id = null,
             tax_id_kind = null,
             tax_id_country = null
       where p.id = m.id;

      /* The original. Blanked in place rather than deleted: the profile
         cascades from this row and the profile is the part the club keeps.
         The address is replaced rather than nulled because auth requires one
         to be present and unique, and a uuid at a domain that cannot receive
         mail is the smallest thing that satisfies both. */
      update auth.users u
         set email = 'departed+' || m.id::text || '@erased.invalid',
             phone = null,
             email_change = '',
             phone_change = '',
             raw_user_meta_data = '{}'::jsonb,
             encrypted_password = null
       where u.id = m.id;

      delete from public.push_subscriptions   where profile_id = m.id;
      delete from public.wallet_tokens        where profile_id = m.id;
      delete from public.member_qr_tokens     where profile_id = m.id;
      delete from public.payment_methods      where profile_id = m.id;
      delete from public.member_marks         where profile_id = m.id;
      delete from public.vetting_files        where profile_id = m.id;
      delete from public.preference_boundaries where profile_id = m.id;
      delete from public.preference_sheets    where profile_id = m.id;

      n := n + 1;
    exception when others then
      perform public.note_cron_skip('erase_departed_profiles', m.id::text, sqlerrm, sqlstate);
    end;
  end loop;

  return n;
end $fn$;

revoke all on function public.erase_departed_profiles() from public, anon, authenticated;

comment on function public.erase_departed_profiles() is
  'Thirty days after somebody departs, blanks their profile AND the auth record behind it, and sweeps the eight tables that hold things about them which do not survive the membership. Deliberately does not delete the auth row: profiles cascades from it, and the profile is what the club keeps under accounting and limitation law. Signatures, the ledger figures and other people''s conversations are kept, each for a reason written at the head of migration 20260906174000. Per-member subtransactions, so one row that will not blank cannot leave the rest standing.';

notify pgrst, 'reload schema';
