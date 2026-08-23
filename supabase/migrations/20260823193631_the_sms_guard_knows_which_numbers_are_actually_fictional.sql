-- The guard skipped '+1500555%', a range I invented. The numbers reserved for
-- fiction in the NANP are 555-0100 through 555-0199 in ANY area code — which
-- is exactly the shape of the fixture already sitting in this table
-- (+1 555 010 0999) and which the guard did not match. It was never skipped;
-- it simply never got picked up. A guard aimed at the wrong pattern reads as
-- protection and provides none.
--
-- It also set status without saying why, so an operator saw a failed text with
-- no attempts and no reason. Say it.
create or replace function public.no_real_texts_to_a_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare digits text := regexp_replace(coalesce(new.to_phone, ''), '[^0-9]', '', 'g');
begin
  if new.to_phone is null
     or length(digits) < 8
     -- 555-0100..555-0199, reserved for fiction in any area code
     or digits ~ '555010[0-9]'
     -- the 555 exchange generally, which no real subscriber holds
     or digits ~ '^1?[0-9]{3}555[0-9]{4}$'
     or new.to_phone like '+1500555%'
  then
    new.status := 'skipped';
    new.last_error := 'fixture number — not sent';
  end if;
  return new;
end;
$$;

revoke execute on function public.no_real_texts_to_a_fixture() from public, anon, authenticated;

drop trigger if exists no_real_texts_to_a_fixture on public.sms_outbox;
create trigger no_real_texts_to_a_fixture
  before insert on public.sms_outbox
  for each row execute function public.no_real_texts_to_a_fixture();

-- The stale fixture: failed, never attempted, no reason recorded.
update public.sms_outbox
   set status = 'skipped', last_error = 'fixture number — not sent'
 where status = 'failed' and attempts = 0;;
