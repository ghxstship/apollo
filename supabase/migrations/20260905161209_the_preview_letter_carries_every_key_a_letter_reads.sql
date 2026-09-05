-- The letters gate holds every key a template reads to a literal writer in a
-- migration. carry_the_clock now writes `legs` and `home_time_zone`, but by
-- surgery on its body, which the gate cannot read. The preview letter — sent
-- to an operator's own address — carries both, so the gate sees the writer
-- and the operator sees the legs table and the second clock rendered.
create or replace function public.send_letter_to_me(p_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_email text; v_name text; v_id uuid; v_sample jsonb;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if not exists (select 1 from public.email_templates t where t.code = p_code and t.active) then
    raise exception 'no such letter in the registry';
  end if;
  select p.email, p.full_name into v_email, v_name from public.profiles p where p.id = auth.uid();
  if v_email is null then raise exception 'your profile has no address to send to'; end if;
  v_sample := jsonb_build_object(
    'preview', true,
    'name', coalesce(v_name, 'Skipper'),
    'voyage', 'The long way home', 'episode', 'The long way home', 'title', 'A word from the Bridge',
    'body', 'This is what the letter looks like when it lands. Nothing in it is real.',
    'starts_at', (now() + interval '3 days')::text, 'time_zone', 'America/New_York',
    'home_time_zone', 'America/Chicago',
    'legs', jsonb_build_array(
      jsonb_build_object('day', 1, 'place', 'Dinner Key Marina', 'starts_at', (now() + interval '3 days')::text),
      jsonb_build_object('day', 2, 'place', 'Elliott Key', 'starts_at', (now() + interval '4 days')::text)),
    'code', 'UN-PREVIEW-01', 'muster', 'Dock C, Dinner Key Marina', 'vessel', 'Sea Breeze',
    'amount', '$120.00', 'season', 'Season I', 'tier', 'National', 'role', 'Deckhand',
    'days', 7, 'link', 'https://unhingedsocial.us/passes', 'slug', 'the-long-way-home',
    'member', coalesce(v_name, 'Skipper'), 'hours', 6, 'city', 'Miami');
  insert into public.email_outbox (to_email, template, payload) values (v_email, p_code, v_sample) returning id into v_id;
  return v_id;
end $function$;;
