-- Staff-only RPCs: not callable anonymously (they also self-check is_staff)
revoke execute on function public.set_application_status(uuid, public.application_status) from public, anon;
revoke execute on function public.accept_application(uuid) from public, anon;
-- Member-only RPC: requires a session
revoke execute on function public.redeem_reward(uuid) from public, anon;
-- Intentionally anon-callable (public funnel, boolean/scalar answers only):
--   email_may_board, validate_invite, application_status_for
