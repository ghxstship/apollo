-- A member could ask for nothing, and the club could prove it answered nothing.
--
-- There is no request path at all: no way to ask for erasure of anything
-- outside the departure flow, no way to object to being profiled for an
-- audience, no way to ask that processing be restricted while a dispute is
-- open, and no way to have a wrong field corrected -- the email column is
-- closed to members by a guard trigger, so rectification is not merely
-- unimplemented, it is impossible in-product.
--
-- There is also no register. Nothing records that a request was made, when the
-- clock started, who verified the person asking, or what was done. The legal
-- page promises an answer "within a week" and nothing anywhere enforces or
-- even observes that.
--
-- One table, six kinds, one clock. The clock is stored rather than computed
-- from a policy constant, because the statutory period differs by where the
-- member is -- one month under the GDPR, forty-five days under the CPRA -- and
-- a due date that is recalculated whenever somebody edits a setting is not a
-- commitment, it is a moving target.

create table if not exists public.data_requests (
  id           bigint generated always as identity primary key,
  profile_id   uuid        not null references public.profiles(id) on delete cascade,
  kind         text        not null check (kind in ('access','portability','rectification','erasure','restriction','objection')),
  detail       text,
  state        text        not null default 'open' check (state in ('open','acknowledged','done','refused','withdrawn')),
  asked_at     timestamptz not null default now(),
  due_at       timestamptz not null,
  answered_at  timestamptz,
  answered_by  uuid references public.profiles(id),
  outcome      text,
  jurisdiction text
);

comment on table public.data_requests is
  'Requests a member makes about their own data, and the clock on each. The register the club did not have: what was asked, when, by when it must be answered, and what happened. A refusal is an outcome and is recorded as one -- some requests are properly refused, and a refusal that leaves no line is indistinguishable from being ignored.';
comment on column public.data_requests.due_at is
  'When the answer is owed. Stored at the moment the request is made, not derived at read time: the period differs by jurisdiction -- a month under the GDPR, forty-five days under the CPRA -- and a due date that moves when somebody edits a setting is not a commitment.';
comment on column public.data_requests.jurisdiction is
  'A copy of the member''s jurisdiction as it stood when they asked, because it decides which clock applies and because they may move.';
comment on column public.data_requests.outcome is
  'What the club did, in words the member reads. Required before a request may be marked done or refused -- a state change with nothing said is the same silence the register exists to end.';

create index if not exists data_requests_open_idx on public.data_requests (due_at) where state in ('open','acknowledged');
create index if not exists data_requests_mine_idx on public.data_requests (profile_id, asked_at desc);

alter table public.data_requests enable row level security;

drop policy if exists "a member reads their own requests" on public.data_requests;
create policy "a member reads their own requests" on public.data_requests
  for select to authenticated
  using (profile_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "the bridge answers a request" on public.data_requests;
create policy "the bridge answers a request" on public.data_requests
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

grant select, update on public.data_requests to authenticated;

-- Asking is a function rather than an INSERT policy: the due date and the
-- jurisdiction are not the member's to set, and an INSERT policy that let them
-- write the row would let them write the clock.

create or replace function public.ask_about_my_data(p_kind text, p_detail text default null)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_who  uuid := auth.uid();
  v_juri text;
  v_days integer;
  v_id   bigint;
  v_open integer;
begin
  if v_who is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_kind not in ('access','portability','rectification','erasure','restriction','objection') then
    raise exception 'that is not something the club knows how to be asked' using errcode = '22023';
  end if;

  select p.jurisdiction into v_juri from public.profiles p where p.id = v_who;

  /* Thirty days where the GDPR applies, forty-five under the CPRA. Where the
     jurisdiction is not yet known, the shorter one -- being early is not a
     breach of anything. */
  v_days := case when public.marketing_needs_opt_in(v_juri) then 30 else 45 end;
  if v_juri is null then v_days := 30; end if;

  /* One open request of a kind at a time. Not a rate limit dressed up: two
     open erasure requests are one request and a duplicate, and answering the
     first answers both. A member who wants to add something says it in a new
     request once this one is closed, or asks the Bridge. */
  select count(*) into v_open from public.data_requests
   where profile_id = v_who and kind = p_kind and state in ('open','acknowledged');
  if v_open > 0 then
    raise exception 'that request is already open — the club owes you an answer on it before another' using errcode = '23505';
  end if;

  insert into public.data_requests (profile_id, kind, detail, due_at, jurisdiction)
  values (v_who, p_kind, left(nullif(btrim(coalesce(p_detail,'')),''), 2000),
          now() + make_interval(days => v_days), v_juri)
  returning id into v_id;

  /* The Bridge is told at once. A clock nobody can see is a clock nobody
     answers, and this is the one the club has published a promise about. */
  insert into public.notifications (profile_id, kind, title, body, href)
  select p.id, 'word', 'A member has asked about their own data.',
         'A ' || p_kind || ' request is open and is owed an answer within ' || v_days || ' days. The register is on the reports screen.',
         '/bridge/reports'
    from public.profiles p where p.is_staff and p.status <> 'departed';

  return v_id;
end $fn$;

revoke all on function public.ask_about_my_data(text, text) from public, anon;
grant execute on function public.ask_about_my_data(text, text) to authenticated;

comment on function public.ask_about_my_data(text, text) is
  'Opens one data-rights request for the caller and starts its clock. A function rather than an INSERT policy because the due date and the jurisdiction are not the member''s to set -- a policy that let them write the row would let them write the clock. Refuses a second open request of the same kind, and tells the Bridge immediately.';

-- An answer must say something.

create or replace function public.an_answer_says_what_happened()
returns trigger
language plpgsql
set search_path to 'public'
as $fn$
begin
  if new.state in ('done','refused') and old.state not in ('done','refused') then
    if nullif(btrim(coalesce(new.outcome, '')), '') is null then
      raise exception 'say what was done before closing a request — a state with nothing written is the silence the register exists to end'
        using errcode = '23514';
    end if;
    new.answered_at := coalesce(new.answered_at, now());
    new.answered_by := coalesce(new.answered_by, auth.uid());
  end if;
  return new;
end $fn$;

revoke all on function public.an_answer_says_what_happened() from public, anon, authenticated;

drop trigger if exists a_closed_request_says_what_happened on public.data_requests;
create trigger a_closed_request_says_what_happened
before update on public.data_requests
for each row execute function public.an_answer_says_what_happened();

comment on function public.an_answer_says_what_happened() is
  'Refuses to close a data request without an outcome written in words, and stamps who closed it and when. A request marked done with nothing said is indistinguishable from one that was ignored.';

notify pgrst, 'reload schema';
