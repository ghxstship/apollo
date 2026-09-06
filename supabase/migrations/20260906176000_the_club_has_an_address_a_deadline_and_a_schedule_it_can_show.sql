-- Three things the club had to be able to say, and one column it needed to say
-- any of them.
--
-- club_settings has held every dial since the beginning and every one of them
-- has been an integer, because every one of them was a count of something. The
-- three settings below are not counts: a postal address, a date, and a policy
-- version. Rather than three new tables or three environment variables that
-- nobody can change without a deploy, the dials table grows a text side.
--
-- value_int stays NOT NULL, so nothing that reads it changes and no existing
-- row moves. A text setting carries a zero there, which is meaningless and
-- reads as such; club_setting_text() is the accessor that knows the difference.

alter table public.club_settings add column if not exists value_text text;

comment on column public.club_settings.value_text is
  'The setting''s value when it is not a number -- an address, a date, a version. NULL for the counts, which live in value_int. A row has one or the other and club_setting_text() reads this side.';

create or replace function public.club_setting_text(p_key text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select nullif(btrim(coalesce(s.value_text, '')), '')
    from public.club_settings s where s.key = p_key;
$fn$;

revoke all on function public.club_setting_text(text) from public;
grant execute on function public.club_setting_text(text) to authenticated, anon, service_role;

comment on function public.club_setting_text(text) is
  'The text side of a dial, or NULL where the row is missing, empty or whitespace. NULL is the honest answer for "not set yet", and every caller must treat it as one -- the postal address in particular is a value whose absence has to stop a send rather than print an empty line.';

-- ── 1. The address that must be on commercial mail ──────────────────────────
--
-- The letter footer renders the literal string "[un] anything goes here" where
-- a valid physical postal address is required, and 206 letters have gone out
-- carrying it. CAN-SPAM has no de-minimis exception and the penalty is per
-- message.
--
-- The row is created deliberately EMPTY. Nobody can invent a club's registered
-- address, and a plausible-looking placeholder is worse than a missing value
-- because it stops anybody noticing. Empty means club_setting_text() answers
-- NULL, and the send path refuses to put a marketing letter in the outbox at
-- all while it does.

insert into public.club_settings (key, value_int, value_text, note) values
  ('postal_address', 0, null,
   'The club''s registered physical postal address, as it must appear in commercial mail. UNSET. Marketing letters do not send while this is empty -- that refusal is the point, not a bug. Transactional letters are unaffected: an address is required on commercial messages, and a weather hold is not one.')
on conflict (key) do nothing;

-- ── 2. When staff two-step stops being optional ─────────────────────────────
--
-- The step-up machinery is good and asks only when a factor already exists, so
-- an operator who has enrolled nothing is protected by a password alone -- and
-- that operator reads every member's personal data, moves money, mints API keys
-- and exports the roster.
--
-- Enforcement is a date rather than a switch because turning it on instantly
-- locks out every operator who has not enrolled, the owner included. A date the
-- Bridge can see, two weeks out, is the difference between a policy and an
-- incident. Before it, an unenrolled operator is warned; after it, refused.

insert into public.club_settings (key, value_int, value_text, note) values
  ('staff_mfa_required_from', 0, '2026-09-20',
   'The day two-step stops being optional for the Bridge. Before it an unenrolled operator is warned on every page; on and after it they are sent to enrol and can do nothing else. Set two weeks out on the owner''s instruction of 2026-09-06. Clearing this row disables enforcement entirely, which is a thing somebody may need at three in the morning and should therefore be possible.')
on conflict (key) do nothing;

-- ── 3. The retention schedule, as the club actually enforces it ─────────────
--
-- Six retention periods run today and not one is disclosed to anybody. The
-- periods are real -- this is the unusual case of a schedule that is enforced
-- in code and simply never published -- so publishing is a matter of reading
-- the dials that already exist and putting them on a page.
--
-- The prose that must accompany them is counsel's, not ours. The setting below
-- carries the version of that prose so the page can say which one it is showing
-- and the consent ledger can point at it; the words themselves are authored
-- outside this repository. Marked here so the omission is visible rather than
-- assumed away.

insert into public.club_settings (key, value_int, value_text, note) values
  ('retention_notice_version', 0, null,
   'Version of the retention notice shown to members. UNSET pending counsel: the periods are enforced and can be listed from the dials, but the prose that frames them is a legal document and is not written here. The page shows the periods either way -- a schedule with no version is still a schedule -- and says the wording is pending.')
on conflict (key) do nothing;

-- ── What the club keeps, and for how long ───────────────────────────────────
--
-- One view, so the member-facing page and the Bridge read the same numbers as
-- the jobs that enforce them. If a dial moves, the published schedule moves
-- with it in the same instant -- which is the only arrangement under which a
-- published schedule stays true.

create or replace view public.retention_schedule as
select * from (values
  ('Notices in your feed',            'notice_retention_days',            'Read notices are swept after this long. Unread ones stay.'),
  ('Letters and texts we sent you',   'outbox_retention_days',            'The copy of what was sent, not the fact that it was.'),
  ('The change log on club records',  'audit_retention_days',             'Which record changed, when, and by whom.'),
  ('A phone that stopped listening',  'wallet_registration_stale_days',   'A device registered for pass updates that has gone quiet.'),
  ('Your profile after you depart',   'departed_erasure_days',            'Then your name, address and telephone number are erased from the profile and from the sign-in behind it.'),
  ('Signed declarations',             'signature_retention_years',        'Held in years, not days -- the limitation period on what the signature evidences.')
) as t(what, dial, why)
;

comment on view public.retention_schedule is
  'The club''s retention periods, named by the dial that enforces them so the published schedule cannot drift from the jobs. Read together with club_setting() for the number. Deliberately a list of dials rather than a list of numbers: a schedule that holds its own copy of the figure is a schedule that goes stale the first time somebody turns one.';

grant select on public.retention_schedule to authenticated, anon;

notify pgrst, 'reload schema';
