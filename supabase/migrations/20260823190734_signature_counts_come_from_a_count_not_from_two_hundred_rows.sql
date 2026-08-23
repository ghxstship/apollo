-- The Documents screen derived "how many have signed this" from a fetch capped
-- at 200 rows. Right at 31 signatures, quietly wrong from 201 — and the number
-- would stop climbing exactly when the club got big enough for it to matter.
create or replace function public.signature_tally()
returns table (document_version_id uuid, n bigint)
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
    select s.document_version_id, count(*)
    from public.signatures s
    where s.document_version_id is not null
    group by s.document_version_id;
end;
$$;

revoke execute on function public.signature_tally() from public, anon;
grant execute on function public.signature_tally() to authenticated;;
