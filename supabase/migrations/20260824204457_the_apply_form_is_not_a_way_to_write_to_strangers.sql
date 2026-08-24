-- Anyone on the internet could make the club post a branded letter to any
-- address they chose, as many times as they liked, with a sentence of their
-- own writing at the top of it.
--
-- `applications` grants INSERT to anon — correctly, it is a public apply form —
-- and the policy bounds every FIELD carefully. It bounds no RATE at all. The
-- insert trigger then queues an `application-received` letter to whatever
-- address was supplied, and `greet()` renders the supplied `full_name` as the
-- first line. Three unauthenticated posts 150ms apart produced three letters.
-- Only `no_real_mail_to_a_fixture` stood between that endpoint and the Resend
-- account, and that guard exists to protect test addresses, not to be the
-- perimeter.
--
-- Two independent problems, closed independently, because either one alone
-- leaves the door usable:
--
--   THE VOLUME. Buckets below. Note which one does the work: the apply form is
--   a SERVER ACTION, so PostgREST sees the Next server's address for every
--   legitimate visitor — one shared bucket for the whole site, the exact trap
--   that made the status-page limit a self-inflicted outage. So the per-caller
--   bound is deliberately loose, and it happens to bite hardest on the path
--   that matters: an attacker posting straight to PostgREST is seen as
--   themselves. The per-address bound is the tight one, and an address cannot
--   be rotated away by changing IP.
--
--   THE WORDS. A letter to an unverified address must not carry text its
--   recipient's correspondent did not write. `application-received` is the one
--   template that goes out before any human has looked, so it loses the
--   applicant-supplied greeting entirely. It says nothing the recipient needs
--   the attacker's help to understand. Every later template — port-invite,
--   welcome-aboard — goes to an address staff have reviewed, and keeps its
--   name.

create or replace function public.pace_the_applications()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
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
  where fingerprint = 'apply-email:' || lower(btrim(new.email))
    and looked_at > now() - interval '1 hour';

  select count(*) into from_here
  from public.status_lookups
  where fingerprint = 'apply-from:' || who
    and looked_at > now() - interval '1 hour';

  -- Three is a person who mistyped and tried again. It is not a campaign.
  if for_this_address >= 3 then
    raise exception 'an application from that address is already with Shoreside — give it a little time'
      using errcode = '53400';
  end if;

  -- Loose, because on the legitimate path this counts the web server rather
  -- than the applicant. It still bounds the direct-to-PostgREST path, which is
  -- the one an attacker uses.
  if from_here >= 150 then
    raise exception 'too many applications from there just now — give it a few minutes'
      using errcode = '53400';
  end if;

  insert into public.status_lookups (fingerprint) values ('apply-email:' || lower(btrim(new.email)));
  insert into public.status_lookups (fingerprint) values ('apply-from:' || who);
  return new;
end $$;

revoke execute on function public.pace_the_applications() from public, anon, authenticated;

drop trigger if exists applications_are_paced on public.applications;
create trigger applications_are_paced
before insert on public.applications
for each row execute function public.pace_the_applications();

-- The letter that goes out before a human has looked carries no supplied text.
create or replace function public.handle_new_application()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.email_outbox (to_email, template, payload)
  values (new.email, 'application-received', '{}'::jsonb);
  return new;
end $$;
;
