-- Every notice in the Inbox was a dead end: kind, title, body, read — no
-- destination. And a member controlled four switches while the club wrote on
-- four channels. The notice gets an href, set by the writer or derived from
-- its kind; the preferences gain a channel row (push, email, sms) beside the
-- categories, and every channel honours it. Safety letters — weather, the
-- boarding pass, the gangway, the waiver, dues — are not marketing and are
-- not switched off by the email toggle; the Sunday letter, the season card,
-- the win-back and a Bridge word are.

alter table public.notifications add column if not exists href text;
comment on column public.notifications.href is 'Where the notice goes when tapped. Set by the writer; derived from kind when null.';

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
      when 'fathoms'  then '/portal'
      when 'dues'     then '/account'
      when 'thread'   then '/threads'
      when 'radar'    then '/radar'
      else '/inbox' end;
  end if;
  return new;
end $function$;
revoke all on function public.a_notice_has_somewhere_to_go() from public, anon, authenticated;
drop trigger if exists a_notice_has_somewhere_to_go on public.notifications;
create trigger a_notice_has_somewhere_to_go
  before insert on public.notifications
  for each row execute function public.a_notice_has_somewhere_to_go();

-- The fan-out reads the category AND the push channel, and sends the notice's
-- own destination.
create or replace function public.fan_out_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare p record; cat text; wanted boolean;
begin
  select * into p from public.profiles where id = new.profile_id;
  cat := case new.kind
    when 'weather'  then 'weather'
    when 'manifest' then 'berths'
    when 'pass'     then 'berths'
    when 'crew'     then 'berths'
    when 'fathoms'  then 'fathoms'
    when 'thread'   then 'threads'
    when 'radar'    then 'radar'
    when 'dues'     then 'dues'
    else null end;
  wanted := cat is null or coalesce((p.notification_prefs->>cat)::boolean, true);
  if wanted and coalesce((p.notification_prefs->'channels'->>'push')::boolean, true) then
    insert into public.push_outbox (profile_id, title, body, url)
    values (new.profile_id, new.title, new.body, coalesce(new.href, '/inbox'));
  end if;
  return new;
end $function$;

-- Marketing mail honours the email channel. Transactional mail does not ask.
create or replace function public.marketing_mail_honours_the_switch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare prefs jsonb;
begin
  if new.template not in ('lore-digest','dispatch-digest','episode-digest','season-card','win-back','bridge-word') then
    return new;
  end if;
  select p.notification_prefs into prefs from public.profiles p where lower(p.email) = lower(new.to_email) limit 1;
  if prefs is not null and coalesce((prefs->'channels'->>'email')::boolean, true) = false then
    new.status := 'skipped';
    new.last_error := 'member turned marketing mail off';
  end if;
  return new;
end $function$;
revoke all on function public.marketing_mail_honours_the_switch() from public, anon, authenticated;
drop trigger if exists marketing_mail_honours_the_switch on public.email_outbox;
create trigger marketing_mail_honours_the_switch
  before insert on public.email_outbox
  for each row execute function public.marketing_mail_honours_the_switch();

create or replace function public.a_text_honours_the_switch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare prefs jsonb;
begin
  select p.notification_prefs into prefs from public.profiles p where p.phone = new.to_phone limit 1;
  if prefs is not null and coalesce((prefs->'channels'->>'sms')::boolean, true) = false then
    new.status := 'skipped';
    new.last_error := 'member turned texts off';
  end if;
  return new;
end $function$;
revoke all on function public.a_text_honours_the_switch() from public, anon, authenticated;
drop trigger if exists a_text_honours_the_switch on public.sms_outbox;
create trigger a_text_honours_the_switch
  before insert on public.sms_outbox
  for each row execute function public.a_text_honours_the_switch();;
