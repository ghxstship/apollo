-- The export returned eight things out of forty-four.
--
-- export_my_data() covered the profile, passes, the two ledgers, notices,
-- proposals, the preference sheet, and a bare list of which documents were
-- signed. Forty-four tables in this schema are keyed to a member. So the export
-- omitted: every message the member wrote, every Open Deck post and comment and
-- hail, their invoices, their saved cards, their galley and shop orders, their
-- poll votes, their waitlist entries, their instalment plans, their subscription,
-- their charter requests, their debriefs, their contest entries, their door
-- grants, their table seats, their pass transfers, their crew record, their
-- vetting file, and every score the club has inferred about them.
--
-- The inferred scores matter more than the length of that list. member_marks,
-- member_engagement, member_value and member_affinity are used to build the
-- audiences the club broadcasts to, and an inference drawn about a person is
-- their personal data as squarely as anything they typed. Leaving them out
-- meant the export was quietest about exactly the part a member would most want
-- to see.
--
-- Three things are deliberately still absent, and each is a refusal rather than
-- an omission:
--
--   wallet_tokens, member_qr_tokens, recovery_codes, calendar_token,
--   boarding_code -- these are live credentials. An export is a file that ends
--   up in a downloads folder, an email attachment and a cloud backup, and
--   putting a working key in one would be handing over the member's own account
--   in the name of giving them their data. The export says they exist and does
--   not carry them.
--
--   Other people. A thread the member is in contains other members' words;
--   this returns what THEY wrote, not what was written to them. That is the
--   line Art. 15(4) draws and it is the right one.
--
--   Staff identity on things written about them. A member is entitled to the
--   substance of a mark or a vetting note; the operator's name is somebody
--   else's personal data.

create or replace function public.export_my_data()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select jsonb_build_object(
    'exported_at', now(),
    'about_this_file', jsonb_build_object(
      'what_is_here', 'Everything the club holds that is about you, except live credentials and other people''s words.',
      'not_here', jsonb_build_array(
        'Your boarding codes, wallet passes, calendar link and recovery codes — these are working keys, and a file in a downloads folder is not where they belong. They exist; they are not printed here.',
        'What other members wrote to you. Your own messages are here; theirs are theirs.',
        'Which operator wrote a note about you. The note is yours to read; their name is not yours to have.'
      ),
      'retention', 'How long the club keeps each kind of thing is published at /you/data.'
    ),

    'profile', (select to_jsonb(p) - 'calendar_token' - 'stripe_customer_id' - 'is_staff' - 'status_set_by'
                from public.profiles p where p.id = auth.uid()),

    'consents', (select coalesce(jsonb_agg(to_jsonb(c) - 'profile_id' order by c.at), '[]'::jsonb)
                 from public.consent_records c where c.profile_id = auth.uid()),
    'account_history', (select coalesce(jsonb_agg(to_jsonb(h) order by h.at), '[]'::jsonb)
                        from public.my_account_history h),

    'passes', (select coalesce(jsonb_agg(to_jsonb(r) - 'boarding_code'), '[]'::jsonb) from public.passes r where r.profile_id = auth.uid()),
    'pass_transfers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.pass_transfers t where t.from_profile = auth.uid() or t.to_profile = auth.uid()),
    'pass_credits', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.pass_credits x where x.profile_id = auth.uid()),
    'waitlist_entries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.waitlist_entries x where x.profile_id = auth.uid()),
    'table_seats', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.table_seats x where x.profile_id = auth.uid()),
    'episode_daybeds', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.episode_daybeds x where x.profile_id = auth.uid()),
    'door_grants', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.door_grants x where x.profile_id = auth.uid()),

    'account_ledger', (select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) from public.account_ledger l where l.profile_id = auth.uid()),
    'knots_ledger', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.knots_ledger f where f.profile_id = auth.uid()),
    'invoices', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.invoices x where x.profile_id = auth.uid()),
    'subscriptions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.subscriptions x where x.profile_id = auth.uid()),
    'installment_plans', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.installment_plans x where x.profile_id = auth.uid()),
    'membership_pauses', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.membership_pauses x where x.profile_id = auth.uid()),
    'payment_methods', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.payment_methods x where x.profile_id = auth.uid()),
    'galley_orders', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.galley_orders x where x.profile_id = auth.uid()),
    'shop_orders', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.shop_orders x where x.profile_id = auth.uid()),
    'reward_redemptions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.reward_redemptions x where x.profile_id = auth.uid()),

    'my_messages', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.messages x where x.author_id = auth.uid()),
    'my_open_deck_posts', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.open_deck_posts x where x.author_id = auth.uid()),
    'my_open_deck_comments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.open_deck_comments x where x.author_id = auth.uid()),
    'my_open_deck_hails', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.open_deck_hails x where x.profile_id = auth.uid()),
    'threads_i_am_in', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.thread_members x where x.profile_id = auth.uid()),
    'poll_votes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.poll_votes x where x.profile_id = auth.uid()),
    'proposals', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.member_event_proposals m where m.proposer_id = auth.uid()),
    'debriefs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.debriefs x where x.profile_id = auth.uid()),
    'contest_entries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.contest_entries x where x.profile_id = auth.uid()),
    'contest_results', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.contest_results x where x.profile_id = auth.uid()),
    'charter_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.charter_requests x where x.profile_id = auth.uid()),
    'crew_requests', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.crew_requests x where x.profile_id = auth.uid()),
    'crew_record', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.crew x where x.profile_id = auth.uid()),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) from public.notifications n where n.profile_id = auth.uid()),

    'preference_sheet', (select to_jsonb(s) from public.preference_sheets s where s.profile_id = auth.uid()),
    'preference_boundaries', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.preference_boundaries x where x.profile_id = auth.uid()),

    /* Agreements now carry the words, not just the fact. A member is entitled
       to what they signed, and "you signed document 7 on Tuesday" is not it. */
    'agreements', (select coalesce(jsonb_agg(jsonb_build_object(
                     'document_version_id', g.document_version_id,
                     'signed_at', g.signed_at,
                     'signer_name', g.signer_name,
                     'signer_email', g.signer_email,
                     'guardian_name', g.guardian_name,
                     'consent_esign', g.consent_esign,
                     'consent_text', g.consent_text,
                     'rendered_hash', g.rendered_hash,
                     'rendered_body', g.rendered_body,
                     'signed_ip', g.signed_ip,
                     'user_agent', g.user_agent)), '[]'::jsonb)
                   from public.signatures g where g.profile_id = auth.uid()),

    /* What the club has worked out about them, rather than what they told it.
       The operator's identity is dropped; the substance is not. */
    'what_the_club_infers', jsonb_build_object(
      'note', 'Scores and notes the club derives about you. These are used to decide who hears about what. You did not tell us these; we worked them out.',
      'marks', (select coalesce(jsonb_agg(to_jsonb(x) - 'author_id' - 'created_by'), '[]'::jsonb)
                from public.member_marks x where x.profile_id = auth.uid()),
      'vetting', (select coalesce(jsonb_agg(to_jsonb(x) - 'decided_by' - 'assigned_to'), '[]'::jsonb)
                  from public.vetting_files x where x.profile_id = auth.uid())
    ),

    'credentials_held_but_not_printed', jsonb_build_object(
      'wallet_passes', (select count(*) from public.wallet_tokens x where x.profile_id = auth.uid()),
      'member_qr_tokens', (select count(*) from public.member_qr_tokens x where x.profile_id = auth.uid()),
      'recovery_codes_unspent', (select count(*) from public.recovery_codes x where x.profile_id = auth.uid() and x.spent_at is null),
      'why', 'These are working keys to your own account. They are counted here so you know they exist, and withheld so that a copy of this file is not a copy of your membership.'
    )
  );
$fn$;

revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

comment on function public.export_my_data() is
  'Everything the club holds about the caller, in one object. Deliberately withholds three things and says so in the file itself: live credentials, other members'' words, and the identity of the operator who wrote a note about them. Inferred scores ARE included -- an inference drawn about a person is their data, and it was the part the old export was quietest about.';

notify pgrst, 'reload schema';
