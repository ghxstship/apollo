-- A live Resend key sits in Vault and the five-minute cron drains against the
-- real provider, so the fixture personas had ninety-seven real messages pushed
-- at them — and a season-card mass send burned the account's whole daily quota,
-- which is what stranded seventy boarding passes.
--
-- The exclusion existed in build_lore_digest and was forgotten in the three
-- other places that queue mail. It moves to the boundary, so every producer
-- inherits it. (The final address list lands in a later migration this round,
-- once it turned out every "real" address was a pre-rebrand fixture domain.)
create or replace function public.no_real_mail_to_a_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.to_email is null
     or position('@' in new.to_email) < 2
     or new.to_email like 'e2e-%'
     or new.to_email like 'skipper@%'
     or new.to_email like '%@demo.%'
     or new.to_email like '%@lyre.social'
     or new.to_email like '%.lyre.social'
     or new.to_email like '%@example.com'
     or new.to_email like '%@example.org'
     or new.to_email like '%@example.net'
     or new.to_email like '%.invalid'
     or new.to_email like '%.test'
     or new.to_email like '%.local'
  then
    new.status := 'skipped';
  end if;
  return new;
end;
$$;

revoke execute on function public.no_real_mail_to_a_fixture() from public, anon, authenticated;

drop trigger if exists no_real_mail_to_a_fixture on public.email_outbox;
create trigger no_real_mail_to_a_fixture
  before insert on public.email_outbox
  for each row execute function public.no_real_mail_to_a_fixture();

create or replace function public.no_real_texts_to_a_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.to_phone is null
     or new.to_phone like '+1500555%'
     or length(regexp_replace(new.to_phone, '[^0-9]', '', 'g')) < 8
  then
    new.status := 'skipped';
  end if;
  return new;
end;
$$;

revoke execute on function public.no_real_texts_to_a_fixture() from public, anon, authenticated;

drop trigger if exists no_real_texts_to_a_fixture on public.sms_outbox;
create trigger no_real_texts_to_a_fixture
  before insert on public.sms_outbox
  for each row execute function public.no_real_texts_to_a_fixture();
