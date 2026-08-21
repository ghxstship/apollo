-- Member numbers carried the Lyre-era LYR- prefix into the Syrius rebrand.
-- New members mint SYR-; existing numbers repoint in place (the sequence part
-- is unchanged, so nobody's number changes — only its house).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_member_no text;
  roll record;
begin
  select * into roll from public.member_roll where lower(email) = lower(new.email);
  new_member_no := 'SYR-' || lpad(nextval('public.member_no_seq')::text, 4, '0');
  insert into public.profiles (id, email, full_name, member_no, tier, home_harbor, plan_id)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    new_member_no,
    coalesce(roll.tier, 'regional'),
    roll.home_harbor,
    (select id from public.membership_plans mp where mp.plan_type = coalesce(roll.tier,'regional')::text and mp.tier = 2)
  );
  insert into public.fathoms_ledger (profile_id, delta, reason) values (new.id, 100, 'Welcome aboard');
  insert into public.notifications (profile_id, kind, title, body)
  values (new.id, 'word', 'Welcome aboard.', 'Your pass to the water is set. The manifest arrives each Sunday.');
  return new;
end $function$;

update public.profiles
set member_no = replace(member_no, 'LYR-', 'SYR-')
where member_no like 'LYR-%';
