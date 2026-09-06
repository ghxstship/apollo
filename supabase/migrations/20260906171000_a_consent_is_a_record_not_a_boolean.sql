-- What did this member agree to, and when? The club could not answer.
--
-- Three consents are collected today and none of them is a record.
--
--   profiles.on_camera        a boolean, default TRUE, overwritten in place.
--   profiles.on_manifest      a boolean, default TRUE, overwritten in place.
--   notification_prefs        a jsonb blob, overwritten wholesale, every
--                             missing key reading true at every reader.
--
-- record_the_change does not fire on profiles, so none of it leaves a line
-- anywhere. And the filming consent is worse than merely unrecorded: setOnCamera
-- writes `camera_withdrawn_at = on ? null : now()`, so a member who withdraws
-- and later re-consents has the timestamp of their withdrawal DELETED. The one
-- fact the club would most need to prove -- that it stopped filming somebody
-- when they asked -- is the one the schema throws away.
--
-- The product already knows how to do this correctly and did it once, for
-- signatures: the document version, a hash of the body actually rendered, the
-- address, the agent and the moment. That is a consent record. None of that
-- pattern reached the three consents above, and this file applies it.
--
-- Two tables rather than one, for the same reason signatures has two. The
-- words shown are versioned in their own table so a later edit cannot rewrite
-- what somebody agreed to; and the record keeps a COPY of the body as well as
-- the version, so even striking a text row cannot change history. Belt and
-- braces, which is the right number for the table whose whole job is to be
-- believed later.

-- ── The words ───────────────────────────────────────────────────────────────

create table if not exists public.consent_texts (
  subject        text        not null,
  version        integer     not null,
  body           text        not null,
  effective_from timestamptz not null default now(),
  primary key (subject, version)
);

comment on table public.consent_texts is
  'The words a member is shown when a consent is asked for, versioned. Append-only: to change the wording, publish a new version. Never edit a row -- somebody agreed to what it said.';

alter table public.consent_texts enable row level security;
drop policy if exists "anyone signed in reads the words" on public.consent_texts;
create policy "anyone signed in reads the words" on public.consent_texts
  for select to authenticated using (true);
grant select on public.consent_texts to authenticated;

drop trigger if exists consent_texts_are_immutable on public.consent_texts;
create trigger consent_texts_are_immutable
before update or delete on public.consent_texts
for each row execute function public.forbid_rewriting_the_record();

insert into public.consent_texts (subject, version, body) values
  ('filming', 1,
   'You agree to appear in what is filmed aboard. You can withdraw this at any time from your settings; withdrawal is honoured from the next stop onward, and cannot reach footage already shot and released.'),
  ('manifest', 1,
   'You agree that your name appears on the manifest of episodes you hold a pass on, where other members aboard that night can read it. Turning this off takes your name off every manifest.'),
  ('marketing_email', 1,
   'You agree to receive the club''s letters that are not about a booking you hold -- the season card, the digest, the word from the Bridge. Turn it off from your settings at any time, or use the unsubscribe link on any of them.'),
  ('marketing_sms', 1,
   'You agree to receive texts from the club that are not about a booking you hold. Message and data rates may apply. Reply STOP to any of them to stop.'),
  ('transactional_sms', 1,
   'You agree to receive texts about bookings you hold -- a weather hold, a gangway code, a change to a night you are on. Reply STOP to any of them to stop.')
on conflict (subject, version) do nothing;

-- ── The record ──────────────────────────────────────────────────────────────

create table if not exists public.consent_records (
  id           bigint generated always as identity primary key,
  profile_id   uuid        not null references public.profiles(id) on delete cascade,
  subject      text        not null,
  granted      boolean     not null,
  text_version integer     not null,
  text_body    text        not null,
  source       text        not null check (source in ('member','staff','import','default')),
  at           timestamptz not null default now(),
  ip           inet,
  user_agent   text,
  note         text,
  foreign key (subject, text_version) references public.consent_texts (subject, version)
);

comment on table public.consent_records is
  'One row per grant or withdrawal, append-only. A withdrawal is a row, not the absence of one -- which is the whole point: the club can show it stopped when it was asked to. The current state of a consent is the newest row for that subject, which is what current_consent reads.';
comment on column public.consent_records.text_body is
  'A copy of the words shown, not a pointer to them. The version is here too, and either alone would be enough on a good day; both are here because this table''s only job is to be believed years later.';
comment on column public.consent_records.source is
  '''member'' is the person themselves. ''staff'' is an operator attesting to something said off-screen, which is weaker and should say so in the note. ''default'' is the club recording what it assumed before it asked -- honest, and not the same as consent.';

create index if not exists consent_records_who_idx on public.consent_records (profile_id, subject, at desc);

alter table public.consent_records enable row level security;

drop policy if exists "a member reads their own consents" on public.consent_records;
create policy "a member reads their own consents" on public.consent_records
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_staff()));

grant select on public.consent_records to authenticated;

drop trigger if exists consent_records_are_immutable on public.consent_records;
create trigger consent_records_are_immutable
before update or delete on public.consent_records
for each row execute function public.forbid_rewriting_the_record();

-- ── What is true now ────────────────────────────────────────────────────────

create or replace view public.current_consent
with (security_invoker = on) as
select distinct on (c.profile_id, c.subject)
       c.profile_id, c.subject, c.granted, c.at, c.text_version, c.source
  from public.consent_records c
 order by c.profile_id, c.subject, c.at desc, c.id desc;

comment on view public.current_consent is
  'The newest row per member per subject -- the state of a consent right now. security_invoker, so the reader sees only what the consent_records policy lets them: their own, or everything if they are staff.';

grant select on public.current_consent to authenticated;

-- ── Recording one ───────────────────────────────────────────────────────────

create or replace function public.record_consent(
  p_subject text,
  p_granted boolean,
  p_source  text default 'member',
  p_ip      text default null,
  p_agent   text default null,
  p_note    text default null
) returns bigint
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_version integer;
  v_body    text;
  v_who     uuid := auth.uid();
  v_id      bigint;
begin
  if v_who is null then
    raise exception 'nobody is signed in to consent to anything' using errcode = '42501';
  end if;
  /* Only the member themselves, or an operator attesting on their behalf. A
     source of 'staff' is a weaker record and the caller must be staff to write
     one; a member cannot dress their own answer as somebody else's. */
  if p_source not in ('member','staff') then
    raise exception 'a consent is recorded by the member or by an operator' using errcode = '22023';
  end if;
  if p_source = 'staff' and not public.is_staff() then
    raise exception 'only the Bridge attests to a consent given off-screen' using errcode = '42501';
  end if;

  /* The newest published wording for this subject. Looked up here rather than
     passed in: a client that names its own consent text is a client that can
     record agreement to words nobody ever saw. */
  select t.version, t.body into v_version, v_body
    from public.consent_texts t
   where t.subject = p_subject and t.effective_from <= now()
   order by t.version desc
   limit 1;
  if v_version is null then
    raise exception 'the club has no words for %, so there is nothing to agree to', p_subject
      using errcode = '22023';
  end if;

  insert into public.consent_records
    (profile_id, subject, granted, text_version, text_body, source, ip, user_agent, note)
  values
    (v_who, p_subject, p_granted, v_version, v_body, p_source,
     nullif(btrim(coalesce(p_ip, '')), '')::inet, left(nullif(btrim(coalesce(p_agent,'')), ''), 400),
     left(nullif(btrim(coalesce(p_note,'')), ''), 400))
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.record_consent(text, boolean, text, text, text, text) from public, anon;
grant execute on function public.record_consent(text, boolean, text, text, text, text) to authenticated;

comment on function public.record_consent(text, boolean, text, text, text, text) is
  'Writes one grant or withdrawal for the caller, against the newest published wording for that subject. The wording is looked up here and copied into the row -- a caller that could name its own consent text could record agreement to words nobody was shown.';

-- ── The withdrawal that used to be erased ───────────────────────────────────
--
-- camera_withdrawn_at stays, because the-show reads it and the trigger that
-- honours a withdrawal at the next stop reads it. What changes is that it is no
-- longer the ONLY record: the consent ledger holds every grant and every
-- withdrawal, so re-consenting can null the column without losing the history.
-- The application half stops nulling it anyway -- see you/actions.ts.

comment on column public.profiles.camera_withdrawn_at is
  'When filming consent was last withdrawn, or null if it stands. A convenience for the surfaces that honour a withdrawal at the next stop -- NOT the record. The record is consent_records, which is append-only and keeps every withdrawal even after a member re-consents.';

notify pgrst, 'reload schema';
