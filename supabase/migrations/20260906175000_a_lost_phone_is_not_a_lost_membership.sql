-- Losing the second factor locked a member out for good.
--
-- There are no recovery codes -- zero occurrences of the idea anywhere in the
-- repository. The magic link works and the password reset works, and both land
-- a session at the first assurance level; the proxy then sends every protected
-- page to /gangway/verify, which is the one screen the member cannot pass.
-- Turning two-step off requires the second assurance level, so they cannot
-- turn it off either. No staff unenrol action exists and no runbook documents
-- one.
--
-- And the lockout is not only from the club. /account is where their money,
-- their invoices and their data export live, so an authentication failure
-- becomes a failure to give somebody their own data on request.
--
-- What a recovery code can and cannot do, because the difference decides the
-- whole design. The assurance level is the auth provider's, minted only when a
-- factor is actually proven -- so nothing in this schema can hand somebody
-- AAL2, and a design that pretended otherwise would be a second way in that
-- the provider does not know about. What a code CAN do is establish that this
-- is the right person, well enough to REMOVE the factor. Once no verified
-- factor exists, the proxy and stepUpRefusal() both stop asking, and an
-- ordinary AAL1 session is enough again. The member is back in, unprotected by
-- two-step, and told to enrol again -- which is the correct outcome, because a
-- member who has lost their authenticator no longer has one.
--
-- So this file holds and spends the codes. Removing the factor is the
-- application's half, through the admin API, and it happens only after this
-- function says the code was good.

create table if not exists public.recovery_codes (
  id         bigint generated always as identity primary key,
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  code_hash  text        not null,
  made_at    timestamptz not null default now(),
  spent_at   timestamptz,
  unique (profile_id, code_hash)
);

comment on table public.recovery_codes is
  'Single-use codes that let a member who has lost their authenticator prove they are themselves well enough to have the factor removed. Only the SHA-256 of each code is here -- the codes are shown once, at enrolment, and the club cannot show them again. Spending one marks it rather than deleting it, so the Bridge can see that a recovery happened.';
comment on column public.recovery_codes.spent_at is
  'When this code was used. A spent code is kept: which code was spent and when is the evidence that a recovery took place, and a deleted row is not evidence of anything.';

create index if not exists recovery_codes_unspent_idx
  on public.recovery_codes (profile_id) where spent_at is null;

alter table public.recovery_codes enable row level security;

/* Deliberately no SELECT policy for anyone, staff included. There is nothing on
   this table a person may read: the hashes are credentials, and how many are
   left is answered by a function rather than by reading rows. */
drop policy if exists "nobody reads a recovery code" on public.recovery_codes;
revoke all on public.recovery_codes from anon, authenticated;

-- ── Minting ─────────────────────────────────────────────────────────────────

create or replace function public.mint_recovery_codes(p_hashes text[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_who uuid := auth.uid();
  n integer;
begin
  if v_who is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_hashes is null or array_length(p_hashes, 1) is null or array_length(p_hashes, 1) > 20 then
    raise exception 'a set of recovery codes is between one and twenty' using errcode = '22023';
  end if;
  /* Hashes are made by the caller and the plain codes never arrive here. That
     is on purpose: a code generated in the database would have to be RETURNED
     through the same channel, and would sit in the statement log of whatever
     ran it. The application makes them, shows them once, and sends only what
     it cannot use to sign in with. */
  if exists (select 1 from unnest(p_hashes) h where h !~ '^[0-9a-f]{64}$') then
    raise exception 'a recovery code is stored as a sha-256, not as itself' using errcode = '22023';
  end if;

  /* A new set replaces the old one entirely. Half a set is worse than none:
     a member holding a printed sheet from last year would not know which of
     those codes still work. */
  delete from public.recovery_codes where profile_id = v_who;
  insert into public.recovery_codes (profile_id, code_hash)
  select v_who, h from unnest(p_hashes) h;
  get diagnostics n = row_count;
  return n;
end $fn$;

revoke all on function public.mint_recovery_codes(text[]) from public, anon;
grant execute on function public.mint_recovery_codes(text[]) to authenticated;

comment on function public.mint_recovery_codes(text[]) is
  'Replaces the caller''s recovery codes with a new set, given their hashes. A new set replaces the old one entirely -- half a set is worse than none, because a member holding an old sheet cannot tell which lines on it still work.';

-- ── Spending ────────────────────────────────────────────────────────────────

create or replace function public.spend_recovery_code(p_profile uuid, p_hash text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_id bigint;
begin
  /* Called by the recovery route with the service role, for somebody who by
     definition cannot finish signing in -- so there is no auth.uid() to read
     and the profile is named by the caller. That makes this function a way to
     test a code against an account, which is why it is granted to nobody: only
     the service role reaches it, behind a rate limit, and it returns a bare
     boolean that says nothing about whether the account exists. */
  perform pg_advisory_xact_lock(hashtext('recovery:' || p_profile::text));

  select id into v_id
    from public.recovery_codes
   where profile_id = p_profile and code_hash = p_hash and spent_at is null
   limit 1;
  if v_id is null then
    return false;
  end if;

  update public.recovery_codes set spent_at = now() where id = v_id;

  /* The Bridge hears about every recovery, without exception. A code being
     spent is either a member who lost their phone or somebody who should not
     have the sheet, and the club cannot tell which from here. */
  insert into public.notifications (profile_id, kind, title, body, href)
  select p.id, 'word', 'A recovery code was used.',
         'Somebody signed in as a member using a printed recovery code, and their second factor has been removed. If that member did not just lose a phone, this is the moment to ask.',
         '/bridge/members'
    from public.profiles p where p.is_staff and p.status <> 'departed';

  return true;
end $fn$;

revoke all on function public.spend_recovery_code(uuid, text) from public, anon, authenticated;

comment on function public.spend_recovery_code(uuid, text) is
  'Spends one unspent recovery code for a member and says whether it was good. Granted to nobody: only the service role reaches it, from the recovery route, because the caller is by definition somebody who cannot finish signing in and so has no auth.uid() to read. Takes an advisory lock on the member so two attempts cannot spend the same code, and tells the whole Bridge every time one is spent.';

-- ── How many are left ───────────────────────────────────────────────────────

create or replace function public.recovery_codes_left()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select count(*)::integer from public.recovery_codes
   where profile_id = auth.uid() and spent_at is null;
$fn$;

revoke all on function public.recovery_codes_left() from public, anon;
grant execute on function public.recovery_codes_left() to authenticated;

comment on function public.recovery_codes_left() is
  'How many unspent recovery codes the caller holds. The count is all a member may know -- the codes themselves cannot be shown again, and the table has no read policy for anybody.';

notify pgrst, 'reload schema';
