-- The one notification a held member actually reads still used the retired
-- currency: "Dues pause; fathoms and tier keep." The public audit compares
-- against raw HTML case-sensitively and only walks public routes, so a
-- lowercase word inside a database-generated notification on a MEMBER page
-- slipped past it twice.
create or replace function public.handle_profile_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'departed' and old.status <> 'departed' then
    insert into public.email_outbox (to_email, template, payload)
    values (new.email, 'farewell', jsonb_build_object('name', new.full_name));
  elsif new.status = 'paused' and old.status <> 'paused' then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.id, 'word', 'Weather hold on your membership.',
            'Dues pause; knots and tier keep. Resume with a word.');
  end if;
  return new;
end $function$;

update public.notifications
set body = replace(body, 'fathoms and tier keep', 'knots and tier keep')
where body like '%fathoms and tier keep%';
update public.notifications set title = replace(title, 'fathoms banked', 'knots banked')
where title ~* 'fathoms banked';
update public.notifications set body = replace(body, 'fathoms', 'knots') where body ~* 'fathoms';

-- Two functions write while a membership is held, deliberately.
comment on function public.claim_stripe_customer(text) is
  'Deliberately outside the hold: settling up is how a held membership resumes.';
comment on function public.sign_document(text, jsonb, boolean, text, text, text, text, text) is
  'Deliberately outside the hold: paperwork is not participation, and signing boards nobody — the gangway gate decides that.';
