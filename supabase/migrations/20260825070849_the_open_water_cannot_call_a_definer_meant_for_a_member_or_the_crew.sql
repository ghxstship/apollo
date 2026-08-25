/* Supabase's default privileges grant EXECUTE on every new function in public
   to anon as well as authenticated, and `revoke ... from public` does not take
   a grant held explicitly by a role. So each of these was reachable signed out.

   Most refuse on their first line — 'sign in first', 'staff only' — and would
   have been merely noisy. membership_pause_days_used() is the one that was not:
   it is SECURITY DEFINER, takes a profile id, and answers. A stranger with a
   member id could have asked how long that member has been away from the club
   this year, one uuid at a time. The refusal at the top of a function is a
   second line of defence, not the first one. */
revoke execute on function public.hold_a_cabin_on_option(uuid, uuid) from anon;
revoke execute on function public.release_charter_option(uuid) from anon;
revoke execute on function public.cabin_places_open(uuid) from anon;
revoke execute on function public.issue_member_qr() from anon;
revoke execute on function public.verify_member_qr(uuid) from anon;
revoke execute on function public.release_member_number(uuid) from anon;
revoke execute on function public.reissue_member_number(uuid, text) from anon;
revoke execute on function public.membership_pause_days_used(uuid) from anon;
revoke execute on function public.post_a_leg_hold(uuid, text, text, text) from anon;
revoke execute on function public.lift_a_leg_hold(uuid, boolean) from anon;
;
