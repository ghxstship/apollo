-- The pipeline at /bridge/crew had five stages, an advance action and no inlet:
-- Apply on the public page was a mailto:, so every candidate in it was typed in
-- by hand against a public-insert policy that already existed and was already
-- covered by the e2e suite. This is the inlet, and the three guards the member
-- application path has had all along, applied to the same shape of problem.

alter table public.crew_candidates
  add column if not exists phone text,
  add column if not exists links text,
  add column if not exists source text,
  add column if not exists cv_url text,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists decided_at timestamptz,
  add column if not exists rejected_reason text;

comment on column public.crew_candidates.cv_url is
  'A LINK, not a file. An anonymous upload endpoint is a different risk from an anonymous row insert — no size limit a policy can express, no content the club can scan, and nothing tying the bytes to a person. A portfolio or profile URL answers the same question and opens nothing.';
comment on column public.crew_candidates.source is
  'How they found the posting, in their words. Free text because a select box would only ever list the channels already known about.';

-- One application per person per role. The member path returns the same class
-- of refusal on 23505 and the form reads it back in the brand's voice.
create unique index if not exists crew_candidates_one_per_role
  on public.crew_candidates (role_id, lower(btrim(email)));

-- Paced exactly as applications are, through the same fingerprint table, so
-- there is one mechanism to reason about rather than two.
create or replace function public.pace_the_crew_applications()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare who text; from_here int; for_this_address int;
begin
  who := coalesce(
    nullif(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into for_this_address
  from public.status_lookups
  where fingerprint = 'crew-email:' || lower(btrim(new.email))
    and looked_at > now() - interval '1 hour';

  select count(*) into from_here
  from public.status_lookups
  where fingerprint = 'crew-from:' || who
    and looked_at > now() - interval '1 hour';

  -- Higher than the member gate: there are four roles, and a candidate who
  -- wants two of them is not a campaign.
  if for_this_address >= 5 then
    raise exception 'we have your applications — give them a little time'
      using errcode = '53400';
  end if;

  if from_here >= 150 then
    raise exception 'too many applications from there just now — give it a few minutes'
      using errcode = '53400';
  end if;

  insert into public.status_lookups (fingerprint) values ('crew-email:' || lower(btrim(new.email)));
  insert into public.status_lookups (fingerprint) values ('crew-from:' || who);
  return new;
end $$;

drop trigger if exists crew_applications_are_paced on public.crew_candidates;
create trigger crew_applications_are_paced
  before insert on public.crew_candidates
  for each row execute function public.pace_the_crew_applications();

insert into public.email_templates (code, description, active)
values ('crew-application-received', 'Acknowledges a crew application and says what happens next.', true)
on conflict (code) do nothing;

create or replace function public.handle_new_crew_candidate()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare told_already int;
begin
  select count(*) into told_already
  from public.email_outbox
  where lower(to_email) = lower(new.email)
    and template = 'crew-application-received'
    and created_at > now() - interval '1 hour';

  if told_already = 0 then
    insert into public.email_outbox (to_email, template, payload)
    values (new.email, 'crew-application-received',
            jsonb_build_object('role', (select title from public.crew_roles where id = new.role_id)));
  end if;
  return new;
end $$;

drop trigger if exists on_crew_application_received on public.crew_candidates;
create trigger on_crew_application_received
  after insert on public.crew_candidates
  for each row execute function public.handle_new_crew_candidate();
;
