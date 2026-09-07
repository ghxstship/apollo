-- ask_about_my_data counted open requests and then inserted one, with nothing
-- between the two.
--
-- Written yesterday, and it carries a comment explaining why a member may hold
-- only one open request of a kind: "two open erasure requests are one request
-- and a duplicate, and answering the first answers both." The rule is right.
-- The implementation was the oldest bug in this schema's family — a read and a
-- write that are each correct and wrong together — and the concurrency harness
-- found it on the first run it was ever pointed at: eight requests fired at one
-- instant, eight saw zero open, eight inserted.
--
-- What it would have cost. Not much on its own: a member double-clicking gets
-- two rows, the Bridge sees two, and somebody closes one. But the register is
-- the club's evidence that it answers within a statutory clock, and a register
-- that can hold duplicates is a register whose counts cannot be trusted — and
-- the clock is the thing the club has published a promise about.
--
-- Both halves, as the pass transfers and the one-live-membership rule already
-- do it. The partial unique index is the guarantee: it is the database saying
-- it, and it holds against a caller that never goes through this function. The
-- advisory lock is so the SECOND caller gets the club's own sentence rather
-- than a Postgres string about a constraint — the lock serialises the pair, so
-- by the time the loser counts, the winner's row is there to be counted.

create unique index if not exists data_requests_one_open_of_a_kind
  on public.data_requests (profile_id, kind)
  where state in ('open', 'acknowledged');

comment on index public.data_requests_one_open_of_a_kind is
  'One open request of a kind per member. Answering the first answers the duplicate, and a register that can hold duplicates is one whose counts cannot be trusted — which matters here because the counts are the club''s evidence that it answered within the clock it published.';

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

  /* Counted and written under one lock, or it is not a rule. Keyed on the
     member and the kind, so a member asking two DIFFERENT things at once is
     never serialised against themselves, and two members never are. */
  perform pg_advisory_xact_lock(hashtext('dsar:' || v_who::text || ':' || p_kind));

  select p.jurisdiction into v_juri from public.profiles p where p.id = v_who;

  /* Thirty days where the GDPR applies, forty-five under the CPRA. Where the
     jurisdiction is not yet known, the shorter one -- being early is not a
     breach of anything. */
  v_days := case when public.marketing_needs_opt_in(v_juri) then 30 else 45 end;
  if v_juri is null then v_days := 30; end if;

  select count(*) into v_open from public.data_requests
   where profile_id = v_who and kind = p_kind and state in ('open','acknowledged');
  if v_open > 0 then
    raise exception 'that request is already open — the club owes you an answer on it before another' using errcode = '23505';
  end if;

  insert into public.data_requests (profile_id, kind, detail, due_at, jurisdiction)
  values (v_who, p_kind, left(nullif(btrim(coalesce(p_detail,'')),''), 2000),
          now() + make_interval(days => v_days), v_juri)
  returning id into v_id;

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
  'Opens one data-rights request for the caller and starts its clock. A function rather than an INSERT policy because the due date and the jurisdiction are not the member''s to set. Counts and writes under an advisory lock on the member and the kind, with a partial unique index behind it: the lock is so the second caller hears the club''s sentence, the index is so the rule holds against a caller that never comes through here.';

notify pgrst, 'reload schema';
