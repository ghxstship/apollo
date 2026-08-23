-- application_status_for is anon-callable, the anon key ships in every page
-- bundle, and PostgREST is a direct call away. Forty rapid lookups all
-- answered: it told anyone, for any address they cared to guess, whether that
-- person had applied to this private club and where they stood. For a club
-- whose whole proposition is discretion, membership itself is the secret.
--
-- The page has to keep working for the applicant checking honestly, so the
-- answer stays available — but not at the rate an enumeration needs. A handful
-- of lookups from one caller in a window is a person; forty is a list.
create table if not exists public.status_lookups (
  fingerprint text not null,
  looked_at   timestamptz not null default now()
);

create index if not exists status_lookups_recent
  on public.status_lookups (fingerprint, looked_at desc);

alter table public.status_lookups enable row level security;
revoke all on public.status_lookups from anon, authenticated;

comment on table public.status_lookups is
  'Rate-limit ledger for the application status page. Written only by application_status_for; nobody reads it but the Bridge.';

drop policy if exists "staff read status lookups" on public.status_lookups;
create policy "staff read status lookups" on public.status_lookups
  for select to authenticated using (public.is_staff());
grant select on public.status_lookups to authenticated;

-- The return type is the application_status enum; keep it.
create or replace function public.application_status_for(p_email text)
returns application_status
language plpgsql
security definer
set search_path to 'public'
as $$
declare who text; recent int; result application_status;
begin
  -- The caller as best the database can see them. Behind a proxy this is the
  -- forwarded address; failing that everyone shares one bucket, which throttles
  -- harder rather than softer.
  who := coalesce(
    nullif(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );

  delete from public.status_lookups where looked_at < now() - interval '1 hour';

  select count(*) into recent
  from public.status_lookups
  where fingerprint = who and looked_at > now() - interval '10 minutes';

  if recent >= 10 then
    raise exception 'too many lookups — wait a few minutes and try again';
  end if;

  insert into public.status_lookups (fingerprint) values (who);

  select status into result from public.applications
  where lower(email) = lower(p_email)
  order by created_at desc limit 1;

  return result;
end;
$$;

revoke execute on function public.application_status_for(text) from public;
grant execute on function public.application_status_for(text) to anon, authenticated;;
