-- Caught by the e2e schema invariant on my own migration from twenty minutes
-- ago — the same default-privileges trap that caught the email_templates table
-- earlier today, which I had just finished warning the other session about.
-- This project grants EXECUTE on new functions to anon by default, and a
-- trigger function has no business being callable by anybody.
revoke execute on function public.profile_takes_harbor_clock() from public, anon, authenticated;
;
