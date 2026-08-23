-- Local migration files drifted from the remote ledger three times in one
-- session, every time because the version in the filename was typed from
-- memory after the fact. The ledger already holds the exact version, name and
-- statements; let the mirror read them rather than reconstruct them.
create or replace function public.ledger_since(p_since text)
returns table (version text, name text, statements text[])
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    raise exception 'that is the Bridge''s to read';
  end if;

  return query
    select m.version, m.name, m.statements
    from supabase_migrations.schema_migrations m
    where m.version > p_since
    order by m.version;
end;
$$;

revoke execute on function public.ledger_since(text) from public, anon;
grant execute on function public.ledger_since(text) to authenticated;;
