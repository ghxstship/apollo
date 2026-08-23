-- Granting these to `authenticated` handed every member the club's delivery
-- volumes and notice counts. A SECURITY DEFINER function does not inherit the
-- caller's policies — that is the whole point of it — so it has to ask who is
-- calling, itself. Written as sql, they could not; they become plpgsql so they
-- can refuse.
create or replace function public.delivery_health()
returns table (channel text, status text, n bigint)
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
    select 'email'::text, e.status::text, count(*) from public.email_outbox e group by e.status
    union all
    select 'push'::text, p.status::text, count(*) from public.push_outbox p group by p.status
    union all
    select 'sms'::text, s.status::text, count(*) from public.sms_outbox s group by s.status;
end;
$$;

create or replace function public.notice_count(p_kind text)
returns bigint
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare n bigint;
begin
  if not public.is_staff() then
    raise exception 'that is the Bridge''s to read';
  end if;
  select count(*) into n from public.notifications where kind = p_kind;
  return n;
end;
$$;

revoke execute on function public.delivery_health() from public, anon;
revoke execute on function public.notice_count(text) from public, anon;
grant execute on function public.delivery_health() to authenticated;
grant execute on function public.notice_count(text) to authenticated;;
