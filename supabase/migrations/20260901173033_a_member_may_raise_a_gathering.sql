-- Members-by-members, the club's way: a member in good standing proposes a
-- gathering; the Bridge answers, out loud, and raises the sailing itself
-- through the same console every sailing comes from. The proposal is the
-- member's to make and withdraw while it stands submitted; the ruling is the
-- Bridge's alone, and it reaches the proposer as a Word either way.
create table public.member_event_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  format text references public.activity_formats(slug) on update cascade on delete set null,
  note text check (coalesce(char_length(note), 0) <= 2000),
  proposed_for date,
  status text not null default 'submitted'
    check (status in ('submitted','considering','approved','declined')),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (coalesce(char_length(decision_note), 0) <= 1000),
  created_at timestamptz not null default now()
);

alter table public.member_event_proposals enable row level security;

create policy "a member raises their own proposal" on public.member_event_proposals
  for insert to authenticated
  with check (proposer_id = auth.uid() and public.is_active() and status = 'submitted'
              and decided_by is null and decided_at is null and decision_note is null);
create policy "a member reads their own proposals" on public.member_event_proposals
  for select to authenticated
  using (proposer_id = auth.uid() or public.is_staff());
create policy "a member withdraws a standing proposal" on public.member_event_proposals
  for delete to authenticated
  using (proposer_id = auth.uid() and status = 'submitted');
create policy "the bridge rules on proposals" on public.member_event_proposals
  for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- The ruling, spoken. One RPC so the decision and the Word cannot drift apart.
create or replace function public.decide_a_proposal(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare pr record;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if p_status not in ('considering','approved','declined') then
    raise exception 'a ruling is considering, approved, or declined';
  end if;

  update public.member_event_proposals
     set status = p_status,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id
  returning * into pr;
  if pr.id is null then raise exception 'no such proposal on the books'; end if;

  insert into public.notifications (profile_id, kind, title, body)
  values (pr.proposer_id, 'word',
          case p_status
            when 'approved' then 'Your gathering is on: ' || pr.title
            when 'declined' then 'Not this one: ' || pr.title
            else 'The Bridge is weighing it: ' || pr.title
          end,
          case p_status
            when 'approved' then 'The Bridge said yes. It goes on the calendar and you''ll see it on the manifest when passes open.'
            when 'declined' then coalesce(pr.decision_note, 'The Bridge passed on this one. Raise another — the door stays open.')
            else 'Your proposal is with the Bridge. You''ll hear the ruling here.'
          end);
end $$;

revoke execute on function public.decide_a_proposal(uuid, text, text) from public, anon;;
