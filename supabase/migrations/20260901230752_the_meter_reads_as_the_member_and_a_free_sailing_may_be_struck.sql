-- member_pass_usage was recreated without security_invoker, which made a
-- member-scoped view answer as its owner: anon read every member's month.
alter view public.member_pass_usage set (security_invoker = true);

-- The inside-the-window guard refused every strike with a pass aboard, money
-- or not. What it protects is money that would be forfeit without a word; a
-- sailing whose passes carry no uncredited charge has nothing to forfeit.
create or replace function public.a_sailing_inside_the_window_is_cancelled_not_struck()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare owed integer;
begin
  if old.status in ('scheduled','live','weather_hold')
     and old.starts_at - now() <= make_interval(hours => public.club_setting('release_credit_hours'))
     and exists (select 1 from public.rsvps r where r.voyage_id = old.id and r.status = 'aboard') then
    select coalesce(-sum(l.delta_cents), 0) into owed
    from public.account_ledger l where l.voyage_id = old.id;
    if owed > 0 then
      raise exception 'inside the credit window a sailing is cancelled, not struck — cancel it and the folios square themselves';
    end if;
  end if;
  return old;
end $$;;
