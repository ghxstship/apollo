-- crew_candidates carried a single `note` column, so a pipeline that moves
-- people through five stages remembered only the last thing anyone typed and
-- nothing at all about who moved them, when, or why. This is the history.
--
-- Append-only by design: an ATS whose record can be edited after a decision is
-- a record nobody can rely on, and rejection reasons are exactly the thing that
-- gets quietly rewritten. There is no UPDATE grant and no update policy.

create table if not exists public.crew_candidate_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.crew_candidates(id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid references public.profiles(id),
  kind text not null check (kind in ('applied', 'stage', 'note', 'email', 'decision')),
  from_stage text,
  to_stage text,
  body text
);

create index if not exists crew_candidate_events_by_candidate
  on public.crew_candidate_events (candidate_id, at desc);

alter table public.crew_candidate_events enable row level security;

-- Staff read and append. Nobody updates; nobody deletes except by the cascade
-- when the candidate row goes, which is the club forgetting a person properly.
drop policy if exists "staff read the crew history" on public.crew_candidate_events;
create policy "staff read the crew history" on public.crew_candidate_events
  for select to authenticated using (public.is_staff());

drop policy if exists "staff write the crew history" on public.crew_candidate_events;
create policy "staff write the crew history" on public.crew_candidate_events
  for insert to authenticated with check (public.is_staff());

grant select, insert on public.crew_candidate_events to authenticated;

-- The first line of every history writes itself, so a candidate who applied
-- through the public form and one typed in by the Bridge look the same
-- afterwards. SECURITY DEFINER because the applicant is anon and has, and
-- should have, no grant on this table at all.
create or replace function public.open_the_crew_history()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.crew_candidate_events (candidate_id, kind, to_stage, body)
  values (new.id, 'applied', new.stage,
          nullif(btrim(coalesce(new.source, '')), ''));
  return new;
end $$;

drop trigger if exists a_crew_candidate_opens_a_history on public.crew_candidates;
create trigger a_crew_candidate_opens_a_history
  after insert on public.crew_candidates
  for each row execute function public.open_the_crew_history();

-- A stage move records itself too, with whoever moved it. Reading auth.uid()
-- rather than trusting a passed-in actor: the one fact the client must not get
-- to choose is whose name is on the decision.
create or replace function public.log_the_crew_stage_move()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.crew_candidate_events (candidate_id, actor, kind, from_stage, to_stage, body)
    values (new.id, auth.uid(),
            case when new.stage = 'passed' then 'decision' else 'stage' end,
            old.stage, new.stage,
            nullif(btrim(coalesce(new.rejected_reason, '')), ''));
  end if;
  return new;
end $$;

drop trigger if exists a_crew_stage_move_is_recorded on public.crew_candidates;
create trigger a_crew_stage_move_is_recorded
  after update on public.crew_candidates
  for each row execute function public.log_the_crew_stage_move();
;
