-- I bounded the application funnel in the policy and, in the same migration,
-- added a SECURITY DEFINER function that writes straight past it.
-- apply_with_invite accepted a 407-character name, a 5 KB note and an email with
-- no '@' — and queued shoreside mail to that non-address. A definer must carry
-- the rules the policy carries, because it is standing in for the policy.
create or replace function public.apply_with_invite(
  p_full_name text, p_email text, p_city text, p_note text, p_code text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid; v_valid boolean;
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_email text := btrim(coalesce(p_email, ''));
  v_city  text := nullif(btrim(coalesce(p_city, '')), '');
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'a name, as the manifest should read it';
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

  select exists (
    select 1 from public.invites
    where upper(code) = upper(btrim(coalesce(p_code, ''))) and uses < max_uses
  ) into v_valid;

  insert into public.applications (full_name, email, city, note, invite_code, status)
  values (v_name, v_email, v_city, v_note,
          case when v_valid then upper(btrim(p_code)) else null end, 'received')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.apply_with_invite(text, text, text, text, text) from public;
grant execute on function public.apply_with_invite(text, text, text, text, text) to anon, authenticated;
