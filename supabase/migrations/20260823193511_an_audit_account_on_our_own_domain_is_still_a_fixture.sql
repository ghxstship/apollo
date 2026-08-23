-- no_real_mail_to_a_fixture caught e2e-*, @demo.*, @lyre.social, skipper@ and
-- the reserved TLDs. It did not catch an address like
-- viewport-audit@syrius.social — an account left behind by an earlier audit, on
-- the club's own domain, which therefore looked like a real member. The Sunday
-- digest queued to it for real and only stopped at the provider's daily quota.
-- Quota is not a safety net; it is the thing that ran out.
--
-- The club's own domain cannot be banned wholesale — real staff read mail
-- there — so the rule is the shape of the name, on any domain.
create or replace function public.no_real_mail_to_a_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare addr text := lower(coalesce(new.to_email, ''));
begin
  if addr ~ '^(e2e|test|probe|audit|fixture|smoke|viewport|qa)[-.]'
     or addr ~ '[-.](audit|probe|fixture|smoke|test)@'
     or addr like '%@demo.%'
     or addr like '%@lyre.social'
     or addr like 'skipper@%'
     or addr like '%@example.com'
     or addr like '%@example.org'
     or addr like '%@example.net'
     or addr like '%.test'
     or addr like '%.invalid'
     or addr like '%.localhost'
  then
    new.status := 'skipped';
    new.last_error := 'fixture address — not sent';
  end if;
  return new;
end;
$$;

revoke execute on function public.no_real_mail_to_a_fixture() from public, anon, authenticated;

drop trigger if exists no_real_mail_to_a_fixture on public.email_outbox;
create trigger no_real_mail_to_a_fixture
  before insert on public.email_outbox
  for each row execute function public.no_real_mail_to_a_fixture();

-- The two that already burned quota are not going to be retried into it.
update public.email_outbox
   set status = 'skipped', last_error = 'fixture address — not sent'
 where status = 'failed'
   and lower(to_email) ~ '(audit|probe|fixture|smoke|viewport)';;
