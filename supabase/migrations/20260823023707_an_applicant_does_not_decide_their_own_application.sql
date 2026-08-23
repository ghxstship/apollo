-- "anyone applies" bounded a name and an email and nothing else, so an
-- anonymous caller could post an application already marked status='aboard'
-- with tier_requested='global'. /apply-status then told that address it was
-- aboard; the Bridge queue showed it green and excluded it from the
-- waiting-on-a-decision count; and accept_application copies tier_requested
-- straight into member_roll. The free text was unbounded too.
alter policy "anyone applies" on public.applications
with check (
  char_length(full_name) between 1 and 120
  and char_length(email) between 5 and 254
  and position('@' in email) > 1
  and coalesce(status, 'received') = 'received'
  and coalesce(tier_requested, 'regional') in ('regional', 'national', 'global')
  and reviewed_by is null
  and decided_at is null
  and coalesce(char_length(note), 0) <= 2000
  and coalesce(char_length(referral), 0) <= 200
);

do $$
begin
  if exists (
    select 1 from pg_policy
    where polrelid = 'public.crew_candidates'::regclass and polname = 'anyone applies to crew'
  ) then
    execute $p$
      alter policy "anyone applies to crew" on public.crew_candidates
      with check (
        char_length(full_name) between 1 and 120
        and position('@' in email) > 1
        and char_length(email) between 5 and 254
        and coalesce(stage, 'applied') = 'applied'
        and coalesce(char_length(note), 0) <= 2000
      )
    $p$;
  end if;
end $$;
