-- The switch on /you says "Off, and only you and the crew ashore can see your
-- page." The view honoured half of it: bio and interests were masked, but
-- handle, tier, home harbour, joined date and camera flag came back for anyone
-- who queried the view directly. /directory/[handle] 404s, so the page was
-- hidden while everything on it stayed readable — the opt-out was a UI filter,
-- not a rule.
--
-- Name and tone stay for everyone, because this view is also how threads,
-- tables, matches and the Open Deck resolve who someone is; a member who
-- leaves the directory should not turn into "Unknown hand" in their own
-- conversation. What goes is the page.
create or replace view public.member_directory
with (security_invoker = false) as
  select id,
         member_no,
         full_name,
         case when in_directory and status = 'active' then handle end as handle,
         case when in_directory and status = 'active' then tier end as tier,
         case when in_directory and status = 'active' then home_harbor end as home_harbor,
         avatar_tone,
         is_staff,
         case when in_directory and status = 'active' then joined_at end as joined_at,
         status,
         case when in_directory and status = 'active' then bio end as bio,
         in_directory,
         case when in_directory and status = 'active' then interests end as interests,
         case when in_directory and status = 'active' then on_camera end as on_camera
  from public.profiles p
  where auth.uid() is not null;

comment on view public.member_directory is
  'Members as other members may see them. Name and tone always resolve, so people are never anonymous in a thread they are part of; everything that makes up the profile page is withheld from anyone who switched the directory off.';

revoke all on public.member_directory from anon, authenticated;
grant select on public.member_directory to authenticated;;
