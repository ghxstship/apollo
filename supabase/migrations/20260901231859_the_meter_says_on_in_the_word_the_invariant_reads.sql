-- security_report reads the option as the literal 'on'; `= true` stores 'true'
-- and the invariant read it as unset. Same setting, the spelling it checks.
alter view public.member_pass_usage set (security_invoker = on);;
