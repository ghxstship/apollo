-- `anon` held TRUNCATE on 72 tables — profiles, rsvps, signatures,
-- account_ledger, fathoms_ledger among them. Found by an agent building on this
-- schema, which revoked it on its own eight tables and deliberately did NOT do
-- the schema-wide pass from inside a feature migration. That was the right call
-- and this is that pass.
--
-- TRUNCATE IS THE ONE WRITE ROW-LEVEL SECURITY DOES NOT SEE. Every other verb
-- goes through policies; TRUNCATE is a table-level operation and RLS is never
-- consulted. So on those 72 tables the ONLY thing standing between the
-- publishable anon key and an empty `signatures` table was that PostgREST does
-- not issue a TRUNCATE.
--
-- That is not a control. It is a property of one client, and it holds only
-- while every path to the database is that client: no SECURITY INVOKER function
-- that interpolates, no future endpoint, no direct connection with the anon
-- role. Latent is one of those away from live, and the blast radius is the
-- whole table with no WHERE clause to get wrong.
--
-- The `anon_write_grants` invariant did not catch it because it tested insert,
-- update and delete and never truncate — so the gate that exists precisely to
-- notice this reported clean on all 72. Extended below, which is the half that
-- matters: revoking today fixes today, and the invariant is what fixes next
-- week.
--
-- Also revoking REFERENCES and TRIGGER, which likewise appear in no policy and
-- which nothing anonymous has any use for.
do $$
declare t record; n int := 0;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('anon', c.oid, 'TRUNCATE')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon', t.relname);
    n := n + 1;
  end loop;
  raise notice 'revoked TRUNCATE from anon on % table(s)', n;
end $$;

-- authenticated has no business truncating either. A member emptying `rsvps`
-- is a worse outcome than a stranger doing it, because they have a session.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege('authenticated', c.oid, 'TRUNCATE')
  loop
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t.relname);
  end loop;
end $$;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

-- And teach the invariant to say it, so this cannot come back quietly.
create or replace function public.anon_write_grants_report()
returns table(check_name text, subject text, ok boolean, detail text)
language sql
stable security definer
set search_path to 'public'
as $$
  select 'anon_write_grants', c.relname::text,
         case
           when c.relname in ('applications', 'crew_candidates')
             then has_table_privilege('anon', c.oid, 'insert')
                  and not has_table_privilege('anon', c.oid, 'update')
                  and not has_table_privilege('anon', c.oid, 'delete')
                  and not has_table_privilege('anon', c.oid, 'truncate')
           else not (has_table_privilege('anon', c.oid, 'insert')
                     or has_table_privilege('anon', c.oid, 'update')
                     or has_table_privilege('anon', c.oid, 'delete')
                     /* TRUNCATE was missing here, and it is the one verb RLS
                        never sees — so this check passed on 72 tables anon
                        could have emptied. */
                     or has_table_privilege('anon', c.oid, 'truncate'))
         end,
         coalesce(nullif(concat_ws(' ',
           case when has_table_privilege('anon', c.oid, 'insert') then 'INSERT' end,
           case when has_table_privilege('anon', c.oid, 'update') then 'UPDATE' end,
           case when has_table_privilege('anon', c.oid, 'delete') then 'DELETE' end,
           case when has_table_privilege('anon', c.oid, 'truncate') then 'TRUNCATE' end
         ), ''), 'none')
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r';
$$;

revoke all on function public.anon_write_grants_report() from public, anon, authenticated;
;
