-- One free-text box and a referral. Vetting is the product, and the leaders
-- ask three to five configurable questions. The questions live in a table
-- the Bridge edits; the answers ride on the application as JSON keyed by the
-- question; and the proposer — the member who put the name forward — has a
-- field of their own beside the invite code that already vouches.
create table if not exists public.application_questions (
  key       text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  prompt    text not null check (length(prompt) between 3 and 200),
  kind      text not null default 'text' check (kind in ('text','long','choice')),
  options   jsonb,
  required  boolean not null default false,
  active    boolean not null default true,
  position  integer not null default 1
);
alter table public.application_questions enable row level security;
create policy "the door reads the live questions" on public.application_questions
  for select to anon, authenticated using (active);
create policy "staff keep the questions" on public.application_questions
  for all to authenticated using (public.is_staff()) with check (public.is_staff());
grant select on public.application_questions to anon, authenticated;
grant insert, update, delete on public.application_questions to authenticated;

insert into public.application_questions (key, prompt, kind, required, position) values
  ('bring',    'What would you bring to a night that nobody else in the room could?', 'long', true, 1),
  ('last_time','Tell us about the last night out that surprised you.',                 'long', false, 2)
on conflict (key) do nothing;

alter table public.applications
  add column if not exists answers  jsonb not null default '{}'::jsonb,
  add column if not exists proposer text check (proposer is null or length(proposer) <= 120);
comment on column public.applications.answers is 'Answers keyed by application_questions.key, as the applicant typed them.';
comment on column public.applications.proposer is 'The member who put this name forward, in the applicant''s words. The invite code is the vouch that is checked.';;
