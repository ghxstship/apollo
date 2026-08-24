-- The pace allows three applications an hour from one address, which is right
-- for a person who mistyped and tried again. It is not right for three letters:
-- the applicant learns nothing from the second, and a stranger whose address
-- was used learns nothing from any of them. One receipt per address per hour,
-- so the worst an unwelcome use of the form can do to an uninvolved person is
-- a single note they can ignore.
create or replace function public.handle_new_application()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare told_already int;
begin
  select count(*) into told_already
  from public.email_outbox
  where lower(to_email) = lower(new.email)
    and template = 'application-received'
    and created_at > now() - interval '1 hour';

  if told_already = 0 then
    insert into public.email_outbox (to_email, template, payload)
    values (new.email, 'application-received', '{}'::jsonb);
  end if;
  return new;
end $$;
;
