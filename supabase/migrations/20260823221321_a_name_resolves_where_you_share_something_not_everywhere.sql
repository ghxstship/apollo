-- I kept full_name readable for every member in this view on the reasoning that
-- nobody should become "Unknown hand" in their own conversation. That reasoning
-- was right and the implementation was too broad: any signed-in member could
-- list the real name of every person in the database, opted-out and paused
-- alike, while /you promises "Off, and only you and the crew ashore can see
-- your page."
--
-- Both things can hold. A name resolves where you actually share something —
-- a thread, a sailing you are both aboard — or where the member chose to be
-- listed. Everywhere else an opted-out member is a member, not a name.
create or replace function public.shares_ground_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_other = auth.uid()
      or public.is_staff()
      or exists (
           select 1
           from public.thread_members mine
           join public.thread_members theirs on theirs.thread_id = mine.thread_id
           where mine.profile_id = auth.uid() and theirs.profile_id = p_other
         )
      or exists (
           select 1
           from public.rsvps mine
           join public.rsvps theirs on theirs.voyage_id = mine.voyage_id
           where mine.profile_id = auth.uid() and theirs.profile_id = p_other
             and mine.status = 'aboard' and theirs.status = 'aboard'
         )
      or exists (
           select 1 from public.pass_transfers t
           where (t.from_profile = auth.uid() and t.to_profile = p_other)
              or (t.to_profile = auth.uid() and t.from_profile = p_other)
         );
$$;

revoke execute on function public.shares_ground_with(uuid) from public, anon;
grant execute on function public.shares_ground_with(uuid) to authenticated;

create or replace view public.member_directory
with (security_invoker = false) as
  select id,
         case when in_directory and status = 'active' then member_no end as member_no,
         case
           when (in_directory and status = 'active') or public.shares_ground_with(id)
             then full_name
           else 'A member'
         end as full_name,
         case when in_directory and status = 'active' then handle end as handle,
         case when in_directory and status = 'active' then tier end as tier,
         case when in_directory and status = 'active' then home_harbor end as home_harbor,
         avatar_tone,
         is_staff,
         case when in_directory and status = 'active' then joined_at end as joined_at,
         case when in_directory and status = 'active' then status end as status,
         case when in_directory and status = 'active' then bio end as bio,
         in_directory,
         case when in_directory and status = 'active' then interests end as interests,
         case when in_directory and status = 'active' then on_camera end as on_camera
  from public.profiles p
  where auth.uid() is not null;

comment on view public.member_directory is
  'Members as other members may see them. A name resolves for anyone who chose to be listed, and for anyone you share a thread, a sailing or a pass hand-off with — so nobody is anonymous where you actually meet them, and an opted-out member is not enumerable to strangers.';

revoke all on public.member_directory from anon, authenticated;
grant select on public.member_directory to authenticated;;
