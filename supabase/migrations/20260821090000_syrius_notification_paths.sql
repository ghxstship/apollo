-- Syrius rebrand: the notification fan-out deep-links into the app, and two of
-- its paths were renamed (/word -> /inbox; /portal keeps its path). Display
-- names live in brand.ts; paths are the one place the database knows a route.
create or replace function public.fan_out_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.profiles where id = new.profile_id;
  insert into public.push_outbox (profile_id, title, body, url)
  values (new.profile_id, new.title, new.body,
          case new.kind when 'manifest' then '/manifest' when 'weather' then '/manifest'
               when 'fathoms' then '/portal' else '/inbox' end);
  if new.kind = 'weather' and p.phone is not null and p.phone_verified then
    insert into public.sms_outbox (to_phone, template, payload)
    values (p.phone, 'weather-hold', jsonb_build_object('title', new.title, 'body', new.body));
  end if;
  return new;
end $$;
revoke execute on function public.fan_out_notification() from public, anon, authenticated;
