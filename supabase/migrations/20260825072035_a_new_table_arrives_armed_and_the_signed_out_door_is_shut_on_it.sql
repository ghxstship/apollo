-- Every table these three modules added arrived with INSERT, UPDATE, DELETE and
-- TRUNCATE granted to `anon`. Nobody wrote that grant: this project's default
-- privileges in `public` arm every new relation, so a bare `create table`
-- produces a table the signed-out world can write to.
--
-- RLS is on and every policy is scoped `to authenticated`, so PostgREST refuses
-- an anon INSERT today — but that is one policy edit away from not being true,
-- and it leaves the tables one migration away from a hole while looking
-- identical to the tables that do not have one. Every pre-existing table in this
-- schema gives anon exactly SELECT: rsvps, profiles, table_picks, matches,
-- voyages and account_ledger all read REFERENCES, SELECT, TRIGGER. The new
-- tables should read the same, and the schema invariant that checks for a write
-- grant left on anon should have nothing to say about them.
--
-- TRUNCATE goes too, which is a step tighter than the rest of the schema. It is
-- not reachable through PostgREST — the API speaks GET, POST, PATCH and DELETE
-- and never issues one — but TRUNCATE is the single DML verb that does not
-- consult row-level security at all, so a grant of it to the signed-out role is
-- a whole table with the lock left off. The older tables still carry it; that is
-- a schema-wide condition and not one to fix quietly from inside a feature
-- migration.
do $$
declare
  t text;
begin
  foreach t in array array[
    'voyage_segment_caps', 'waitlist_entries', 'vetting_files',
    'preference_sheets', 'preference_boundaries',
    'voyage_radar', 'radar_picks', 'shared_anchors', 'captains_log_envelopes',
    'run_of_show', 'elements', 'element_substitutes', 'pod_sessions'
  ]
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon', t);
  end loop;
end $$;

-- And the two views, which the same default privileges armed. They are
-- SELECT-only by construction — one is an aggregate over a group by and the
-- other filters on auth.uid() — so a write grant on them was never going to do
-- anything useful, but "not useful" is not the same as "not there".
revoke insert, update, delete, truncate on public.voyage_segment_capacity from anon, authenticated;
revoke insert, update, delete, truncate on public.own_vetting_state from anon, authenticated;;
