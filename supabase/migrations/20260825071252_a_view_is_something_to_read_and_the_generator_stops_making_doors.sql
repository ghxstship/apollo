-- A VIEW HAS NO RLS OF ITS OWN. It runs as its owner unless security_invoker
-- says otherwise, and `postgres` is not subject to row-level security on the
-- tables underneath. An auto-updatable view over a protected table is therefore
-- a hole exactly the size of its column list — and this project's default
-- privileges hand `anon` and `authenticated` INSERT, UPDATE, DELETE and
-- TRUNCATE on every relation created in `public`. Nobody granted that. It is
-- the schema default, and it has been silently arming every view added since.
--
-- Two were verified exploitable, side by side with their own controls:
--
--   as an ordinary member, against ANOTHER member's row —
--     PATCH /rest/v1/profiles?id=eq.<them>         → 200 []      (RLS refused)
--     PATCH /rest/v1/member_directory?id=eq.<them> → 200 [row]   (the view applied it)
--   so any member could flip any other member's `in_directory`: setting it true
--   re-publishes somebody who deliberately opted out — name, handle, tier,
--   harbour, bio, join date, interests — which is precisely what three earlier
--   migrations were written to prevent, and setting it false erases them.
--   (`is_staff` was already stopped by guard_profile_columns, which fires on
--   the view path too. `in_directory` was not in its list.)
--
--   and with the PUBLISHABLE ANON KEY AND NO SESSION AT ALL —
--     POST /rest/v1/vetting_files     → 401 42501  (RLS refused)
--     POST /rest/v1/own_vetting_state → 400 23514  (a CHECK stopped it)
--   the second got past RLS and the grants and died on a column constraint the
--   prober chose to trip on purpose. With a legal value it would have written.
--
-- Ten views carry these grants. One of them, voyage_segment_capacity, was
-- created by an agent WHILE THIS AUDIT WAS BEING WRITTEN and was armed on
-- arrival — which is the whole argument for fixing the generator rather than
-- the instances.
--
-- Views are for reading. Every write path in this product goes through a table
-- policy or a definer function, and not one of them goes through a view, so
-- nothing legitimate loses anything here.
do $$
declare v record;
begin
  for v in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', v.relname);
  end loop;
end $$;

-- And the generator itself, so the next view is not the eleventh instance.
-- SELECT is left alone: that is how the app reads, and every view here is
-- either security_invoker or deliberately definer with its own WHERE gate.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon;
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from authenticated;

-- Tables need their write grants — RLS is what protects those, and revoking
-- here would break every member write in the product. So the defaults are
-- narrowed and each TABLE that needs DML keeps what it was granted explicitly.
-- Re-grant to the tables that already exist, since the default change does not
-- touch them and the loop above only ran over views.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('grant insert, update, delete on public.%I to authenticated', t.relname);
  end loop;
end $$;
;
