-- The e2e schema invariant caught this on the table I added an hour ago: this
-- project's default privileges hand anon INSERT/UPDATE/DELETE on every new
-- table, and I created one without revoking them. RLS refused the writes, so
-- nothing was reachable — but a grant that exists is a grant one policy change
-- away from mattering, and the invariant is right to refuse it. The registry is
-- the club's statement of which letters exist; a stranger has no business
-- adding to it.
revoke insert, update, delete on public.email_templates from anon;
revoke insert, update, delete on public.email_templates from authenticated;

-- Staff maintain it, and only through a definer or the dashboard. Nothing in
-- the app writes it at runtime.
comment on table public.email_templates is
  'Which letters the sender can render. Read-only to the app; run_automations refuses to queue a template that is not listed here, and the route audit refuses a listing the sender cannot render.';
;
