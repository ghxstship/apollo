-- The last pass pinned status, tier_requested, reviewed_by and decided_at, and
-- bounded note and referral — and stopped there. waiver_swim, waiver_conduct
-- and invite_code were still the applicant's to set, so an anonymous POST could
-- arrive with the safety and conduct attestations already true and any real
-- member's invite code attached. city and interests[] were unbounded too.
alter policy "anyone applies" on public.applications
with check (
  char_length(full_name) between 1 and 120
  and char_length(email) between 5 and 254
  and position('@' in email) > 1
  and coalesce(status, 'received') = 'received'
  and coalesce(tier_requested, 'regional') in ('regional', 'national', 'global')
  and reviewed_by is null
  and decided_at is null
  and coalesce(waiver_swim, false) = false
  and coalesce(waiver_conduct, false) = false
  and invite_code is null
  and coalesce(char_length(note), 0) <= 2000
  and coalesce(char_length(referral), 0) <= 200
  and coalesce(char_length(city), 0) <= 120
  and coalesce(array_length(interests, 1), 0) <= 12
  and coalesce((select max(char_length(i)) from unnest(coalesce(interests, '{}')) i), 0) <= 60
);

create or replace function public.apply_with_invite(
  p_full_name text, p_email text, p_city text, p_note text, p_code text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id uuid; v_valid boolean;
begin
  select exists (
    select 1 from public.invites
    where upper(code) = upper(btrim(p_code)) and uses < max_uses
  ) into v_valid;

  insert into public.applications (full_name, email, city, note, invite_code, status)
  values (btrim(p_full_name), btrim(p_email), nullif(btrim(p_city), ''), nullif(btrim(p_note), ''),
          case when v_valid then upper(btrim(p_code)) else null end, 'received')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.apply_with_invite(text, text, text, text, text) from public;
grant execute on function public.apply_with_invite(text, text, text, text, text) to anon, authenticated;

comment on function public.apply_with_invite(text, text, text, text, text) is
  'Lodges an application with an invite code, recording the code only if it is real and unspent.';
