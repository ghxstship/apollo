-- A door grant lets its holder stamp arrivals, but profiles is own-or-staff
-- and the waiver standing view is invoker-scoped, so a door saw "A member"
-- with no number and no waiver state for anyone who opted out of the
-- directory. The gangway is not the directory: everyone on the manifest is
-- named at the door, and whether they signed is the whole question. One
-- definer, scoped to the episode the grant names.
create or replace function public.door_manifest(p_episode uuid)
returns table (pass_id uuid, profile_id uuid, full_name text, member_no text, waiver_current boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select r.id, r.profile_id, p.full_name, p.member_no, coalesce(w.current, false)
    from public.passes r
    join public.profiles p on p.id = r.profile_id
    left join public.member_waiver_standing w on w.profile_id = p.id
   where r.episode_id = p_episode and public.is_door(p_episode);
$$;
revoke all on function public.door_manifest(uuid) from public, anon;
grant execute on function public.door_manifest(uuid) to authenticated;;
