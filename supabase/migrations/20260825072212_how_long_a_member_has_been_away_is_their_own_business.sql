/* membership_pause_days_used() took a profile id, ran SECURITY DEFINER, and
   answered for anybody.

   The table it reads is properly sealed — `your own pauses or staff` — and then
   this function walked straight past that policy for any caller holding a
   member id, which every signed-in member does: the directory hands out ids.
   The answer is not trivia. "How many days has this member been away from the
   club this year" is a health question, a relationship question and a money
   question, and the club promises the log records what happened and never how
   a member places.

   The refusal is the same shape membership_pauses' own policy uses, so the
   function and the policy now say one thing instead of two. */
create or replace function public.membership_pause_days_used(p_profile uuid)
returns integer
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_days integer;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if p_profile <> auth.uid() and not public.is_staff() then
    raise exception 'that is not your record';
  end if;

  select coalesce(sum(
    extract(epoch from (
      least(coalesce(mp.ended_at, now()), now())
      - greatest(mp.started_at, now() - interval '365 days')
    )) / 86400
  ), 0)::integer
    into v_days
  from public.membership_pauses mp
  where mp.profile_id = p_profile
    and mp.by_the_member
    and coalesce(mp.ended_at, now()) > now() - interval '365 days';

  return v_days;
end;
$$;

/* The pause-budget guard calls this from inside a trigger, where auth.uid() is
   the member whose row is being written — so the new check passes for a member
   pausing themselves and would refuse for a staff-placed pause, which the guard
   already returns early on. Belt: the guard is the definer's own caller and
   runs as the owner, and is_staff() is true for the Bridge. */
revoke all on function public.membership_pause_days_used(uuid) from public, anon;
grant execute on function public.membership_pause_days_used(uuid) to authenticated;
;
