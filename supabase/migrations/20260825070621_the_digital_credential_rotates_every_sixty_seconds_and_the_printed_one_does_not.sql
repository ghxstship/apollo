/* The member card is one design in two media, and the two media have opposite
   security models: the CR80 print carries a static QR that is gate-checked, and
   the digital card carries a QR that rotates every 60 seconds while online.

   This is deliberately a DIFFERENT column from rsvps.boarding_code, and the
   discipline is the opposite one. A boarding code is matched literally by a
   human reading it off a stub, which is why the migration
   `a_boarding_code_is_matched_literally_so_it_is_stored_plainly` exists and why
   it is stored in the clear. A rotating credential is never read by a human,
   never spoken, and is worthless sixty seconds after it is issued — folding
   rotation onto boarding_code would break every stub in a pocket.

   Rotation has to be server-issued. A client-side timer redrawing the same
   payload is an animation, not a rotation: the scanner accepts the old value
   forever, so a screenshot boards. The TTL is on the row and the gangway asks
   the database. */
create table public.member_qr_tokens (
  token uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint a_credential_expires_after_it_is_issued check (expires_at > issued_at)
);

create index member_qr_tokens_by_member on public.member_qr_tokens (profile_id, expires_at desc);

alter table public.member_qr_tokens enable row level security;

/* Your own live credential and nobody else's — not even the crew's. A staff
   read of this table would be a way to mint an ABOARD scan for a member who is
   not at the gangway, which is the one thing the rotation exists to prevent.
   The crew's route in is verify_member_qr(), which takes a token someone
   physically presented. */
create policy "your own credential" on public.member_qr_tokens
  for select to authenticated using (profile_id = auth.uid());

revoke insert, update, delete on public.member_qr_tokens from anon, authenticated;

create or replace function public.issue_member_qr()
returns table (token uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in first'; end if;

  /* Sweep your own dead tokens on the way past. Lazy rather than scheduled, for
     the same reason the cabin option expires lazily: a rule that needs a cron
     to be true is false whenever the cron is down. */
  delete from public.member_qr_tokens
   where profile_id = v_uid and expires_at <= now() - interval '5 minutes';

  return query
    insert into public.member_qr_tokens (profile_id, expires_at)
    values (v_uid, now() + interval '60 seconds')
    returning member_qr_tokens.token, member_qr_tokens.expires_at;
end;
$$;

/* The gangway's three states, and only three. ABOARD, HOLD and VOID — the kit
   is explicit that VOID is never read aloud to a line, which is presentation;
   what the database owes is that the three are distinguishable and that a
   stale credential is never one of the other two.

   HOLD is a member the club knows whose standing stops them at the top of the
   ramp. The kit's example of a hold is a pending deposit; that reading is not
   wired here and should not be faked — a money hold is a second reason for the
   same state and account_ledger is where it would come from. */
create or replace function public.verify_member_qr(p_token uuid)
returns table (state text, profile_id uuid, full_name text, member_no text, standing text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row record;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select t.profile_id, t.expires_at, p.full_name, p.member_no, p.status
    into v_row
  from public.member_qr_tokens t
  join public.profiles p on p.id = t.profile_id
  where t.token = p_token;

  if v_row.profile_id is null or v_row.expires_at <= now() then
    /* Unknown and expired are the same answer on purpose: telling the holder of
       a stale code that it was once real is telling a stranger that it was. */
    return query select 'void'::text, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  return query select
    case when v_row.status = 'active' then 'aboard' else 'hold' end,
    v_row.profile_id, v_row.full_name, v_row.member_no, v_row.status;
end;
$$;

revoke all on function public.issue_member_qr() from public;
revoke all on function public.verify_member_qr(uuid) from public;
grant execute on function public.issue_member_qr() to authenticated;
grant execute on function public.verify_member_qr(uuid) to authenticated;
;
