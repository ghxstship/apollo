-- Three small things the new features' tests and pages asked for.
--
-- The suite creates debriefs and broadcasts and had no way to strike them, so
-- it declared the residue. Staff may delete both.
create policy "staff strike a debrief" on public.debriefs
  for delete to authenticated using (public.is_staff());
grant delete on public.debriefs to authenticated;
create policy "staff strike a broadcast" on public.broadcasts
  for delete to authenticated using (public.is_staff());
grant delete on public.broadcasts to authenticated;

-- The fixture-address trigger runs after the marketing switch (name order)
-- and overwrote the reason it had written, so the reason was unobservable on
-- any test address. Keep a reason already on the row.
create or replace function public.no_real_mail_to_a_fixture()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  addr text := lower(coalesce(new.to_email, ''));
  why  text;
begin
  if addr = '' or position('@' in addr) < 2 then
    why := 'not a deliverable address';
  elsif addr ~ '^(e2e|test|probe|audit|fixture|smoke|viewport|qa)[-.]' then
    why := 'reserved fixture prefix';
  elsif addr ~ '[-.](audit|probe|fixture|smoke|test)@' then
    why := 'reserved fixture suffix';
  elsif addr = 'skipper@https://unhingedsocial.us' then
    why := 'the seeded demo account';
  elsif addr like '%@demo.%'
     or addr like '%@https://unhingedsocial.us'
     or addr like '%@example.com'
     or addr like '%@example.org'
     or addr like '%@example.net'
     or addr like '%.test'
     or addr like '%.invalid'
     or addr like '%.localhost'
  then
    why := 'reserved fixture domain';
  end if;

  if why is not null then
    new.status := 'skipped';
    new.last_error := coalesce(new.last_error, 'fixture address — not sent (' || why || ')');
  end if;
  return new;
end;
$function$;

-- Knots notices pointed at /portal, which is a thin page now; the Knots live
-- on You.
create or replace function public.a_notice_has_somewhere_to_go()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.href is null then
    new.href := case new.kind
      when 'manifest' then '/passes'
      when 'pass'     then '/passes'
      when 'weather'  then '/passes'
      when 'crew'     then '/passes'
      when 'fathoms'  then '/you#you-knots'
      when 'dues'     then '/account'
      when 'thread'   then '/threads'
      when 'radar'    then '/radar'
      else '/inbox' end;
  end if;
  return new;
end $function$;;
