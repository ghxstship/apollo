-- RLS, grants, and a starting clause library.
--
-- Policies are scoped `to authenticated` throughout, per the convention the
-- security_report invariants enforce: a policy left on PUBLIC is evaluated for
-- anon, and any policy anon can reach that calls is_staff() errors rather than
-- denies. Guests reach these tables only through the token RPCs, never directly.

alter table public.clauses enable row level security;
alter table public.clause_versions enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_clauses enable row level security;
alter table public.document_requirements enable row level security;
alter table public.signatures enable row level security;

-- The library is staff tooling. Members never read raw clauses — they read a
-- rendered document, which comes from a definer function.
create policy "staff keep the clause library" on public.clauses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read clause versions" on public.clause_versions
  for select to authenticated using (public.is_staff());

create policy "staff publish clause versions" on public.clause_versions
  for insert to authenticated with check (public.is_staff());

-- What documents exist, and what they gate, is not a secret: a member is
-- entitled to know what they will be asked to sign before they are asked.
create policy "members see the document list" on public.documents
  for select to authenticated using (active or public.is_staff());

create policy "staff keep documents" on public.documents
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "members see published versions" on public.document_versions
  for select to authenticated using (status = 'published' or public.is_staff());

create policy "staff draft versions" on public.document_versions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff compose documents" on public.document_clauses
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "members see what is required" on public.document_requirements
  for select to authenticated using (true);

create policy "staff set requirements" on public.document_requirements
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

/* A signature is readable by the person who made it and by staff. There is no
   INSERT policy at all: the only way to sign is through sign_document or
   sign_document_as_guest, which compute the hash server-side. A client that
   could insert its own row could claim to have signed anything. */
create policy "own or staff signatures" on public.signatures
  for select to authenticated using (
    profile_id = auth.uid()
    or public.is_staff()
    or exists (
      select 1 from public.rsvp_guests rg
      join public.rsvps r on r.id = rg.rsvp_id
      where rg.id = signatures.guest_id and r.profile_id = auth.uid()
    )
  );

-- anon writes nothing here; the funnels are the only exception in the schema.
do $$
declare t text;
begin
  foreach t in array array['clauses', 'clause_versions', 'documents', 'document_versions',
                           'document_clauses', 'document_requirements', 'signatures']
  loop
    execute format('revoke insert, update, delete on public.%I from anon', t);
  end loop;
end;
$$;

-- ===== A starting library ====================================================
-- These are placeholders in the club's voice, not legal advice. The platform's
-- job is proving what was shown and agreed; the words want a lawyer, and the
-- whole point of versioning is that replacing them costs nothing.

insert into public.clauses (code, title, category, position) values
  ('assumption-of-risk',   'Assumption of risk',            'liability', 1),
  ('sea-conditions',       'Conditions at sea',             'liability', 2),
  ('swim-competency',      'Swimming and water competency', 'liability', 3),
  ('vessel-instructions',  'Instructions aboard',           'conduct',   4),
  ('alcohol-conduct',      'Alcohol and conduct',           'conduct',   5),
  ('shore-venue',          'Ashore, at a venue',            'liability', 6),
  ('media-release',        'Photography aboard',            'media',     7),
  ('data-notice',          'What the club records',         'privacy',   8),
  ('medical-disclosure',   'Medical disclosure',            'liability', 9),
  ('guardian-consent',     'Signing for a minor',           'liability', 10),
  ('membership-terms',     'Terms of membership',           'payment',   11),
  ('dues-and-cancellation','Dues and cancellation',         'payment',   12),
  ('crew-engagement',      'Terms of engagement',           'crew',      13)
on conflict (code) do nothing;

insert into public.clause_versions (clause_code, version, body, note)
select v.code, 1, v.body, 'Initial wording'
from (values
  ('assumption-of-risk',
   'Assumption of risk. Time on and around the water carries risk that no amount of seamanship removes — weather turns, decks move, and equipment fails. You accept those risks knowingly and voluntarily when you come aboard.'),
  ('sea-conditions',
   'Conditions at sea. The skipper has final authority over the sailing, including whether it happens at all. A sailing may be shortened, rerouted, or called off for weather or safety, and the decision is not open to appeal at the dock.'),
  ('swim-competency',
   'Swimming and water competency. You confirm you can swim unaided, or that you will wear the flotation the crew provides for the whole time you are aboard. Tell the skipper before you board if anything about this has changed.'),
  ('vessel-instructions',
   'Instructions aboard. You will follow the instructions of the skipper and crew without argument, and immediately in a safety matter. This is the one rule aboard that is not a matter of taste.'),
  ('alcohol-conduct',
   'Alcohol and conduct. The club serves at its discretion and stops serving at its discretion. Anyone whose conduct endangers or diminishes the day may be put ashore at the next reasonable opportunity, without refund.'),
  ('shore-venue',
   'Ashore, at a venue. Port Days take place at venues the club does not own. You accept the ordinary risks of the premises, and the club is not answerable for the acts of a venue or its staff.'),
  ('media-release',
   'Photography aboard. The club photographs its sailings and publishes a selection, credited by name. You may decline at any time by telling Shoreside, and a frame already published will be removed on request.'),
  ('data-notice',
   'What the club records. The club keeps your membership record, the sailings you attend, and this agreement, for as long as you are a member and for six years afterwards, so that a claim can be answered. You may ask what is held, ask for it to be corrected, or ask for it to be erased — where a record is needed to answer a legal claim, the club redacts the person and keeps the proof. Write to Shoreside.'),
  ('medical-disclosure',
   'Medical disclosure. You will tell the skipper before boarding about any condition, medication, or allergy that could matter at sea, and about anything that would make evacuation difficult. It stays between you and the skipper.'),
  ('guardian-consent',
   'Signing for a minor. Where the person aboard is under eighteen, the adult signing accepts these terms on their behalf and confirms they hold the authority to do so.'),
  ('membership-terms',
   'Terms of membership. Membership is personal, non-transferable, and offered at the club''s discretion. It may be ended by either side; where the club ends it other than for conduct, the unused part of the dues is returned.'),
  ('dues-and-cancellation',
   'Dues and cancellation. Dues are charged in advance for the period chosen. A pass released more than forty-eight hours before departure is credited in full; inside that window the club keeps the charge, because the seat sailed empty.'),
  ('crew-engagement',
   'Terms of engagement. Engagement is per sailing unless agreed otherwise in writing. Certification must be current and produced on request, and the club carries the insurance stated in your engagement letter.')
) as v(code, body)
where not exists (
  select 1 from public.clause_versions cv where cv.clause_code = v.code and cv.version = 1
);

insert into public.documents (code, title, kind, audience, validity_months) values
  ('member-waiver',     'Member waiver and release',   'waiver',   'member',  12),
  ('guest-waiver',      'Guest waiver and release',    'waiver',   'guest',   null),
  ('membership-agreement', 'Membership agreement',     'contract', 'member',  null),
  ('crew-agreement',    'Crew engagement agreement',   'contract', 'crew',    null)
on conflict (code) do nothing;

insert into public.document_requirements (document_code, gate) values
  ('member-waiver', 'board_sea'),
  ('member-waiver', 'board_shore'),
  ('membership-agreement', 'join_club'),
  ('guest-waiver', 'guest_board'),
  ('crew-agreement', 'crew_engage')
on conflict do nothing;

-- Compose and publish v1 of each. The conditional clauses are the point: one
-- member waiver assembles differently for a Sea Day than for a Port Day.
do $$
declare
  dv uuid;
begin
  -- Member waiver v1
  if not exists (select 1 from public.document_versions where document_code = 'member-waiver') then
    insert into public.document_versions (document_code, version, status)
    values ('member-waiver', 1, 'draft') returning id into dv;

    insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
    select dv, cv.id, x.pos, x.cond
    from (values
      ('assumption-of-risk',  1, '{}'::jsonb),
      ('sea-conditions',      2, '{"class":"sea"}'::jsonb),
      ('swim-competency',     3, '{"class":"sea"}'::jsonb),
      ('medical-disclosure',  4, '{"class":"sea"}'::jsonb),
      ('vessel-instructions', 5, '{"class":"sea"}'::jsonb),
      ('shore-venue',         6, '{"class":"shore"}'::jsonb),
      ('alcohol-conduct',     7, '{}'::jsonb),
      ('media-release',       8, '{}'::jsonb),
      ('data-notice',         9, '{}'::jsonb)
    ) as x(code, pos, cond)
    join public.clause_versions cv on cv.clause_code = x.code and cv.version = 1;

    update public.document_versions
    set status = 'published', effective_from = now(), published_at = now()
    where id = dv;
  end if;

  -- Guest waiver v1
  if not exists (select 1 from public.document_versions where document_code = 'guest-waiver') then
    insert into public.document_versions (document_code, version, status)
    values ('guest-waiver', 1, 'draft') returning id into dv;

    insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
    select dv, cv.id, x.pos, x.cond
    from (values
      ('assumption-of-risk',  1, '{}'::jsonb),
      ('sea-conditions',      2, '{"class":"sea"}'::jsonb),
      ('swim-competency',     3, '{"class":"sea"}'::jsonb),
      ('medical-disclosure',  4, '{"class":"sea"}'::jsonb),
      ('vessel-instructions', 5, '{"class":"sea"}'::jsonb),
      ('shore-venue',         6, '{"class":"shore"}'::jsonb),
      ('alcohol-conduct',     7, '{}'::jsonb),
      ('guardian-consent',    8, '{}'::jsonb),
      ('media-release',       9, '{}'::jsonb),
      ('data-notice',        10, '{}'::jsonb)
    ) as x(code, pos, cond)
    join public.clause_versions cv on cv.clause_code = x.code and cv.version = 1;

    update public.document_versions
    set status = 'published', effective_from = now(), published_at = now()
    where id = dv;
  end if;

  -- Membership agreement v1
  if not exists (select 1 from public.document_versions where document_code = 'membership-agreement') then
    insert into public.document_versions (document_code, version, status)
    values ('membership-agreement', 1, 'draft') returning id into dv;

    insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
    select dv, cv.id, x.pos, '{}'::jsonb
    from (values
      ('membership-terms', 1),
      ('dues-and-cancellation', 2),
      ('alcohol-conduct', 3),
      ('data-notice', 4)
    ) as x(code, pos)
    join public.clause_versions cv on cv.clause_code = x.code and cv.version = 1;

    update public.document_versions
    set status = 'published', effective_from = now(), published_at = now()
    where id = dv;
  end if;

  -- Crew agreement v1
  if not exists (select 1 from public.document_versions where document_code = 'crew-agreement') then
    insert into public.document_versions (document_code, version, status)
    values ('crew-agreement', 1, 'draft') returning id into dv;

    insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
    select dv, cv.id, x.pos, '{}'::jsonb
    from (values
      ('crew-engagement', 1),
      ('vessel-instructions', 2),
      ('data-notice', 3)
    ) as x(code, pos)
    join public.clause_versions cv on cv.clause_code = x.code and cv.version = 1;

    update public.document_versions
    set status = 'published', effective_from = now(), published_at = now()
    where id = dv;
  end if;

end;
$$;
