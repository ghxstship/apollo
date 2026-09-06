-- The previous migration marked four dials public and broke four checks.
--
-- It picked those four from what the suite happened to assert, which is not a
-- principle — it is a list of the places somebody had already written a test.
-- The suite then named three more that a member is plainly entitled to: the
-- pause budget, the dues grace period, and the erasure horizon, which the club
-- publishes on its own retention schedule. Getting told that by a test rather
-- than by a member is the good outcome; deciding the rest by the same method
-- would not be.
--
-- So here is the rule, written down once so the next dial does not need a
-- judgement call:
--
--   A dial is PUBLIC READING when its value is a rule the club states — a
--   figure a member is told, or would be entitled to ask for, or that appears
--   in the club's own copy. The pause budget, the release window, what a pass
--   is worth in knots, how long a signed declaration is kept.
--
--   A dial is PRIVATE when it is a setting of the machine — a threshold, a
--   window, an operator's tooling. Where the failure alarm fires, how long a
--   pacing turn is kept, how many devices a pass may sit on. Knowing these
--   helps nobody except somebody probing the club, and alarm_app_errors in
--   particular tells a caller exactly how many failures they may cause before
--   anybody is woken.
--
-- The retention periods are all public, without exception, because the club
-- publishes them at /you/data and a schedule that says one thing on a page
-- while the dial behind it refuses to answer is not a published schedule.

update public.club_settings set is_public = true where key in (
  -- What a membership costs you in time
  'pause_days_a_year',          -- the pause budget, stated on the account
  'dues_grace_days',            -- the final notice names the date it runs to
  'release_credit_hours',       -- "release 48 hours out for full credit", in the terms
  'cabin_option_hours',         -- a cabin held on option, no charge
  'waitlist_claim_hours',       -- an offered seat is yours for this long
  'seat_hold_minutes',          -- a raced table seat is held this long
  'addon_cutoff_hour',          -- add-ons close the evening before

  -- What the club owes you back
  'knots_per_nm',
  'knots_port_day',
  'referral_knots',
  'match_guarantee_cents',      -- the credit when a Radar night yields nothing

  -- Who you may bring, and for how long a code lasts
  'invite_expiry_days',
  'invite_season_cap_league_one',
  'invite_season_cap_league_two',
  'invite_season_cap_league_three',
  'invite_season_cap_league_four',
  'invite_season_cap_league_five',
  'member_number_hold_days',

  -- When the club will and will not write to you. A stated courtesy, and a
  -- member sets their own window over the top of it.
  'quiet_from_hour',
  'quiet_to_hour',

  -- Every period on the published retention schedule. A schedule that says one
  -- thing on a page while the dial behind it refuses to answer is not
  -- published, it is decorated.
  'notice_retention_days',
  'outbox_retention_days',
  'audit_retention_days',
  'wallet_registration_stale_days',
  'session_stale_days',
  'departed_erasure_days',
  'signature_retention_years'
);

-- And the ones that stay shut, named here rather than left to inference:
--   alarm_window_minutes, alarm_repeat_hours, alarm_cron_runs, alarm_app_errors
--     — where the alarms are, which is the club's business alone.
--   api_key_days, api_key_warn_days, api_key_last_days, api_key_stale_days
--     — operator tooling for a console members never see.
--   house_credit_max_cents — the ceiling one operator may post without a
--     second name. A figure that invites somebody to test it.
--   wallet_devices_per_pass — a member is told "as many devices as the club
--     keeps track of", deliberately without the number.
--   pacing_retention_hours, project_ref, postal_address,
--   retention_notice_version, staff_mfa_required_from — machinery and dates.

comment on column public.club_settings.is_public is
  'Whether an anonymous caller may read this dial. The rule: TRUE for a figure the club states — a rule a member is told or entitled to ask for — and FALSE for a setting of the machine. False by default, so a dial added next year is private until somebody decides otherwise. See migration 20260906204000 for the reasoning and for what deliberately stays shut.';

notify pgrst, 'reload schema';
