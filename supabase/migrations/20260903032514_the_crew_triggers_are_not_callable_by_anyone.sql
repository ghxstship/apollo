-- Revoking from PUBLIC was not enough: this database also grants EXECUTE to
-- anon and authenticated by default privilege, which is a separate grant and
-- survives a PUBLIC revoke. The roles have to be named.
--
-- authenticated mattered as much as anon here. A signed-in member is not staff,
-- and log_the_crew_stage_move writes the append-only history that records who
-- decided what — a member able to call it directly could write a decision into
-- somebody's record under a staff id they chose.
revoke execute on function public.pace_the_crew_applications() from anon, authenticated;
revoke execute on function public.handle_new_crew_candidate() from anon, authenticated;
revoke execute on function public.open_the_crew_history() from anon, authenticated;
revoke execute on function public.log_the_crew_stage_move() from anon, authenticated;;
