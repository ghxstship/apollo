-- The brake on the credential paths lived in one server's memory.
--
-- src/lib/rate-limit.ts is honest about what it is -- "the window lives in the
-- memory of one server instance, so on a serverless host every instance has
-- its own and a cold start begins at zero" -- and it says outright that
-- anything which has to hold counts in the database instead. That reading is
-- right, and until today the only thing following it was the Producer.
--
-- Meanwhile the paths where the ceiling actually matters were relying on the
-- memory one:
--
--   /api/recover spends a recovery code, and a wrong guess costs an attacker
--   nothing. Ten tries per address per ten minutes was the intent; on a
--   platform running forty instances the real figure is four hundred, and a
--   cold start resets it. Twelve characters of Crockford is 32^12, so this is
--   not a break -- but a limit that is forty times looser than it reads is a
--   limit nobody can reason about, and it is the sort of number that stops
--   being safe when somebody shortens the code.
--
--   Sign-in has no limiter at all. The audit found no lockout and no failed
--   attempt counter anywhere in this repository; the provider does its own
--   throttling, which is real but is not ours and is not asserted by anything
--   here.
--
-- One table, one function, the idiom the Producer already uses: count and
-- spend under one advisory lock keyed on the bucket, so two tabs of the same
-- caller serialise and two different callers never do.
--
-- NO ADDRESSES ARE STORED. The bucket arrives already hashed by the caller --
-- an address, a mailbox, a member id, whatever identifies the thing being
-- paced -- and this table holds only the digest. A pacing ledger that held
-- addresses would be a log of who tried to sign in and from where, kept for as
-- long as nobody swept it, which is a different table with a different set of
-- obligations attached to it.

create table if not exists public.pacing (
  bucket    text        not null,
  at        timestamptz not null default now(),
  id        bigint generated always as identity primary key
);

comment on table public.pacing is
  'One row per attempt on a paced path -- sign-in, recovery, anything where a wrong guess is free. Holds a SHA-256 of whatever identifies the caller and never the thing itself: this table must not become a log of who tried to sign in and from where. Swept by the nightly retention run.';
comment on column public.pacing.bucket is
  'A digest, always. The caller hashes an address, a mailbox or a member id with the path''s own name mixed in, so two paths cannot share a ceiling by accident and a digest here cannot be turned back into a person.';

create index if not exists pacing_bucket_idx on public.pacing (bucket, at desc);

alter table public.pacing enable row level security;
drop policy if exists "nobody reads the pacing ledger" on public.pacing;
create policy "nobody reads the pacing ledger" on public.pacing
  for select to authenticated using (false);
revoke all on public.pacing from anon, authenticated;

create or replace function public.spend_a_turn(
  p_bucket text,
  p_limit  integer,
  p_seconds integer
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare spent integer;
begin
  if p_bucket is null or p_bucket !~ '^[0-9a-f]{64}$' then
    /* The bucket is a digest or it is nothing. A caller passing a raw address
       would put one in this table, which is the thing the table exists not to
       hold. */
    raise exception 'a pacing bucket is a sha-256' using errcode = '22023';
  end if;
  if p_limit < 1 or p_seconds < 1 or p_seconds > 86400 then
    raise exception 'that is not a window' using errcode = '22023';
  end if;

  /* Counted and spent under one lock, or it is not a limit. Keyed on the
     bucket, so two attempts by one caller serialise and two callers never do. */
  perform pg_advisory_xact_lock(hashtext('pace:' || p_bucket));

  select count(*) into spent
    from public.pacing
   where bucket = p_bucket and at > now() - make_interval(secs => p_seconds);

  if spent >= p_limit then
    return false;
  end if;

  insert into public.pacing (bucket) values (p_bucket);
  return true;
end $fn$;

revoke all on function public.spend_a_turn(text, integer, integer) from public, anon, authenticated;

comment on function public.spend_a_turn(text, integer, integer) is
  'Spends one turn against a bucket and says whether it was allowed. Counts and writes under an advisory lock on the bucket, so the ceiling holds across every instance rather than per instance — which is the whole reason it is here and not in a Map. Service role only: it is reached from route handlers, which are the things being paced.';

/* Swept with everything else. A pacing row is useful for the length of its own
   window and is a small pile of digests after that. */
insert into public.club_settings (key, value_int, note) values
  ('pacing_retention_hours', 24,
   'How long a spent pacing turn is kept. Longer than any window the club uses, short enough that the ledger stays small. It holds only digests, so this is housekeeping rather than a retention obligation.')
on conflict (key) do nothing;

create or replace function public.sweep_pacing()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare n integer := 0;
begin
  begin
    delete from public.pacing
     where at < now() - make_interval(hours => greatest(1, coalesce(public.club_setting('pacing_retention_hours'), 24)));
    get diagnostics n = row_count;
  exception when others then
    perform public.note_cron_skip('sweep_pacing', 'all', sqlerrm, sqlstate);
    return 0;
  end;
  return n;
end $fn$;

revoke all on function public.sweep_pacing() from public, anon, authenticated;

comment on function public.sweep_pacing() is
  'Clears pacing turns older than the club''s window. Wrapped like every other sweep: a failure here must not take the rest of the nightly run with it.';

select cron.schedule('pacing-sweep-hourly', '40 * * * *', $$select public.sweep_pacing()$$);

notify pgrst, 'reload schema';
