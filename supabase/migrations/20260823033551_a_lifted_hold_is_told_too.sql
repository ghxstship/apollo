-- Deduplicating the hold notice went one step too far. The trigger fires only on
-- the transition INTO 'paused', so once the Bridge's own notify was removed a
-- member put on hold was told and a member taken off hold was told nothing —
-- even though dues and access resume.
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
  elsif new.status = 'active' and old.status = 'paused' then
    insert into public.notifications (profile_id, kind, title, body)
    values (new.id, 'word', 'Your membership is running again.',
            'The hold is lifted. Booking, posting and contests are open, and dues pick up where they left off.');
  end if;
  return new;
end $function$;
