-- club_settings carries pause_days_a_year, which the pause budget reads, and
-- pause_days_per_year, which nothing reads. Two dials for one rule is how they
-- drift apart. Prove nothing reads the orphan, then remove it.
do $$
declare readers text;
begin
  select string_agg(p.proname, ', ') into readers
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc like '%pause_days_per_year%';
  if readers is not null then raise exception 'pause_days_per_year is still read by: %', readers; end if;
  delete from public.club_settings where key = 'pause_days_per_year';
end $$;;
