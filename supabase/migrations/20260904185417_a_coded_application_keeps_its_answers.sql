-- apply_with_invite took no answers and no proposer, and anon cannot update
-- the row it writes, so an applicant arriving on a member's code was asked
-- the committee's questions and their answers were dropped. The RPC takes
-- them now. The old five-argument shape is dropped so PostgREST has one
-- function to resolve.
drop function if exists public.apply_with_invite(text, text, text, text, text);

create or replace function public.apply_with_invite(
  p_full_name text, p_email text, p_city text, p_note text, p_code text,
  p_answers jsonb default '{}'::jsonb, p_proposer text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_valid boolean;
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_prop  text := nullif(btrim(coalesce(p_proposer, '')), '');
  k text;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'a name, as the gangway should read it';
  end if;
  if char_length(v_email) < 5 or char_length(v_email) > 254 or position('@' in v_email) < 2 then
    raise exception 'an address we can reach you at';
  end if;
  if coalesce(char_length(v_city), 0) > 120 then
    raise exception 'that city name is too long';
  end if;
  if coalesce(char_length(v_note), 0) > 2000 then
    raise exception 'keep it to a couple of thousand characters';
  end if;
  if coalesce(char_length(v_prop), 0) > 120 then
    raise exception 'a proposer is a name, not a paragraph';
  end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'answers arrive keyed by question';
  end if;
  for k in select jsonb_object_keys(coalesce(p_answers, '{}'::jsonb)) loop
    if not exists (select 1 from public.application_questions q where q.key = k) then
      raise exception 'that is not one of the questions';
    end if;
    if char_length(coalesce(p_answers->>k, '')) > 1000 then
      raise exception 'an answer is up to a thousand characters';
    end if;
  end loop;

  select exists (
    select 1 from public.invites
    where upper(code) = upper(btrim(coalesce(p_code, ''))) and uses < max_uses
  ) into v_valid;

  if not v_valid then
    raise exception 'that code doesn''t answer — check it against the note it came with, or apply without one';
  end if;

  insert into public.applications (full_name, email, city, note, invite_code, status, answers, proposer)
  values (v_name, v_email, v_city, v_note, upper(btrim(p_code)), 'received', coalesce(p_answers, '{}'::jsonb), v_prop)
  returning id into v_id;
  return v_id;
end;
$function$;
revoke all on function public.apply_with_invite(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.apply_with_invite(text, text, text, text, text, jsonb, text) to anon, authenticated;;
