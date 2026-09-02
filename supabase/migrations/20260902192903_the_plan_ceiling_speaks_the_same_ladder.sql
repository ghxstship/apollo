/* The other half of the duration ladder, and the half that gates money.

   membership_plans.class_ceiling stores the same three words as
   episodes.sub_class and is compared against it on every booking. Renaming one
   side without the other would leave a regional plan whose ceiling reads
   'voyage' unable to match an episode whose band now reads 'passage' — the
   comparison would simply stop being equal, and the failure mode is a member
   silently refused a pass they are entitled to, or worse, admitted to one they
   are not.

   The two migrations are separate only because they are separate tables. Do not
   replay one without the other. */
do $$
declare n int;
begin
  alter table public.membership_plans drop constraint if exists membership_plans_class_ceiling_check;

  update public.membership_plans set class_ceiling = 'passage' where class_ceiling = 'voyage';
  get diagnostics n = row_count;
  raise notice 'class_ceiling voyage -> passage: % plans', n;

  alter table public.membership_plans add constraint membership_plans_class_ceiling_check
    check (class_ceiling is null or class_ceiling in ('passage','expedition','odyssey'));
end $$;

/* Prove the two sides still meet. Every episode band must be reachable by some
   plan ceiling, or the rename has quietly locked a whole duration out of the
   club. */
do $$
declare orphan text;
begin
  select string_agg(distinct e.sub_class, ', ')
    into orphan
  from public.episodes e
  where e.sub_class is not null
    and e.sub_class not in (
      select p.class_ceiling from public.membership_plans p where p.class_ceiling is not null
    );
  if orphan is not null then
    raise exception 'episode bands no plan can reach: % — the ladder is broken', orphan;
  end if;
end $$;;
