-- The opt-out masked the profile page's fields but left member_no and status
-- readable for every row, alongside the name. A member number is the club's
-- own identifier for a person and their standing is nobody else's business —
-- neither is needed to resolve who wrote a message, which is the only reason
-- this view returns anything for an opted-out member at all.
--
-- What remains for someone who has left the directory: their id, their name,
-- and their avatar tone. Enough that they are not "Unknown hand" in a thread
-- they are part of, and nothing more.
create or replace view public.member_directory
with (security_invoker = false) as
  select id,
         case when in_directory and status = 'active' then member_no end as member_no,
         full_name,
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
  'Members as other members may see them. Name and tone always resolve, so nobody is anonymous in a thread they are part of; everything else — number, standing, harbour, handle, profile — is withheld from anyone who switched the directory off.';

revoke all on public.member_directory from anon, authenticated;
grant select on public.member_directory to authenticated;;
