-- Four index findings, each measured on a replayed corpus seeded to club scale
-- (10 000 members, 250 000 ledger lines, 60 000 passes, 40 000 letters) rather
-- than asserted. Every before/after below is the median of five runs of
-- explain (analyze, buffers) on the query the app actually issues.

-- 1 ── THE MEMBER STATEMENT.
-- /account reads eq(profile_id).order(created_at desc).limit(24). Only a bare
-- (profile_id) index existed, so the database fetched every line the member
-- ever had and top-N sorted it to find twenty-four.
--   before  0.64 ms,  43 buffers, Sort over 2 500 rows
--   after   0.06 ms,  25 buffers, no sort at all
-- The composite serves every lookup the bare index served — proved by dropping
-- it and re-planning both the statement read and the balance sum, which move
-- to the composite at identical cost — so the bare one goes rather than being
-- paid for on every ledger write.
create index if not exists account_ledger_statement
  on public.account_ledger (profile_id, created_at desc);
drop index if exists public.account_ledger_profile_id_idx;

-- 2 ── THE CALENDAR FEED.
-- calendar_feed(p_token) is SECURITY DEFINER, reachable by anon, and resolves a
-- member by calendar_token. profiles carried indexes on id, member_no, handle,
-- stripe_customer_id, plan_id and home_city — and none on the one column an
-- unauthenticated request arrives holding.
--   before  0.99 ms, 286 buffers, Seq Scan on profiles
--   after   0.04 ms,   3 buffers, Index Scan
-- Unique, not merely indexed: the column is not null with a gen_random_uuid()
-- default, and rotate_calendar_token drawing a token that already exists should
-- fail loudly rather than quietly wire two members' calendars together.
create unique index if not exists profiles_calendar_token_key
  on public.profiles (calendar_token);

-- 3 ── TWO INDEXES THAT ARE PAID FOR AND NEVER CHOSEN.
-- pass_credits_by_member is (profile_id, period desc) beside the unique
-- (profile_id, period); clause_versions_code_idx is (clause_code, version desc)
-- beside the unique (clause_code, version). A btree reads backwards, so with an
-- equality on the leading column the unique index answers "latest first" at
-- exactly the same cost — proved by dropping each and re-planning: identical
-- plan node cost (52.32 and 148.95), identical buffers (3), the only change
-- being "Index Scan" becoming "Index Scan Backward". At the seeded sizes the
-- two redundant copies were 1288 kB and 816 kB of pure write tax.
drop index if exists public.pass_credits_by_member;
drop index if exists public.clause_versions_code_idx;

-- 4 ── THE OUTBOX DRAIN.
-- The three senders all ask the same thing: status = pending AND
-- (next_attempt_at is null OR next_attempt_at <= now()), oldest first, 200 at a
-- time. The only index was (created_at) WHERE status = 'pending', which orders
-- correctly and cannot exclude a row that is deferred — so with a head of
-- retry-deferred letters the drain walks every one of them on every pass:
--   5 800 deferred at the head, 200 ready:  1.31 ms, 5 893 buffers,
--   5 797 rows removed by filter.
--
-- Adding (next_attempt_at, created_at) WHERE status='pending' alongside the
-- existing index — the obvious fix — changes NOTHING. Measured: the planner
-- keeps the ordered index because the LIMIT makes it look cheap, and the new
-- index is never chosen. 1.31 ms and 5 893 buffers again.
--
-- What does work is removing the null arm. next_attempt_at means "the earliest
-- this may be tried"; a row that has never been deferred may be tried now, so
-- its honest value is its own creation time, not the absence of one. With no
-- nulls in the column the OR collapses to a range the index can serve:
--   deferred head:   1.31 ms / 5 893 buf  ->  0.27 ms / 228 buf
--   healthy queue:   0.14 ms /     6 buf  ->  0.21 ms / 200 buf
-- The second line is the whole reason the ORDER BY moves too: ordering by
-- created_at makes the planner sort the ready set, which costs more than it
-- saves on a healthy queue. Ordering by next_attempt_at is a pure ordered index
-- scan, fast in both states, and it is the more correct queue discipline —
-- for a letter that has never been deferred the two columns hold the same
-- instant, and for one that has, "may be tried at 10:00" should go before "may
-- be tried at 10:05" whatever order they were written in. The three sender
-- functions change their `order=` accordingly; the filter stays as it is,
-- because a null arm that can no longer match costs nothing to leave in.
update public.email_outbox set next_attempt_at = created_at where next_attempt_at is null;
update public.sms_outbox   set next_attempt_at = created_at where next_attempt_at is null;
update public.push_outbox  set next_attempt_at = created_at where next_attempt_at is null;

alter table public.email_outbox alter column next_attempt_at set default now();
alter table public.sms_outbox   alter column next_attempt_at set default now();
alter table public.push_outbox  alter column next_attempt_at set default now();

alter table public.email_outbox alter column next_attempt_at set not null;
alter table public.sms_outbox   alter column next_attempt_at set not null;
alter table public.push_outbox  alter column next_attempt_at set not null;

drop index if exists public.email_outbox_pending_idx;
drop index if exists public.sms_outbox_pending_idx;
drop index if exists public.push_outbox_pending_idx;

create index email_outbox_pending_idx on public.email_outbox (next_attempt_at, created_at) where status = 'pending';
create index sms_outbox_pending_idx   on public.sms_outbox   (next_attempt_at, created_at) where status = 'pending';
create index push_outbox_pending_idx  on public.push_outbox  (next_attempt_at, created_at) where status = 'pending';

comment on column public.email_outbox.next_attempt_at is
  'The earliest this letter may be tried. A letter that has never been deferred carries its own creation time, so the drain never has to ask about a null.';
