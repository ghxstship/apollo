/* "Your number is held for 90 days. After that it goes back in the pool."

   The release is a fact about the NUMBER, so it lives in its own table rather
   than as a column on profiles. A `profiles.member_no_released_at` would be
   writable by its owner — the "own profile update" policy allows any column
   guard_privileged_profile_columns does not name, and naming it there means
   rewriting a guard three other modules are also editing this week. A separate
   table has no such hole and needs no rewrite.

   handle_new_user() is deliberately NOT changed. It mints from a sequence and
   will keep minting from a sequence: it runs on auth.users insert, it is the
   only path a member exists through, and quietly teaching it to reuse numbers
   is a change to the live signup path that cannot be tested without creating
   real accounts. Reissue is a deliberate act by the Bridge, and this is the
   rule it has to satisfy. */
create table public.member_number_releases (
  member_no text primary key,
  profile_id uuid references public.profiles(id) on delete set null,
  released_at timestamptz not null default now(),
  reissued_at timestamptz,
  reissued_to uuid references public.profiles(id) on delete set null,
  constraint a_reissue_is_recorded_with_its_holder
    check ((reissued_at is null) = (reissued_to is null))
);

alter table public.member_number_releases enable row level security;

/* The pool is the crew's business. A member reading it learns which numbers are
   about to be handed to someone else, which is nobody's business and is a
   directory of who has left. */
create policy "staff keep the number pool" on public.member_number_releases
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

revoke insert, update, delete on public.member_number_releases from anon;
revoke insert, update, delete on public.member_number_releases from authenticated;

/* Give a number up. Idempotent: releasing twice is the same release, and the
   clock runs from the first one — restarting it would let a mistaken re-release
   hold a number out of the pool forever. */
create or replace function public.release_member_number(p_profile uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_no text;
  v_at timestamptz;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select member_no into v_no from public.profiles where id = p_profile;
  if v_no is null then raise exception 'that member holds no number'; end if;

  insert into public.member_number_releases (member_no, profile_id)
  values (v_no, p_profile)
  on conflict (member_no) do nothing;

  select released_at into v_at from public.member_number_releases where member_no = v_no;
  return v_at;
end;
$$;

/* Hand a released number to someone else, and refuse for the ninety days the
   kit promises. The refusal names the date rather than the rule, because the
   person reading it wants to know when, not why. */
create or replace function public.reissue_member_number(p_profile uuid, p_number text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rel record;
  v_holder uuid;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  select * into v_rel from public.member_number_releases where member_no = p_number;
  if v_rel.member_no is null then
    raise exception 'that number was never given up';
  end if;
  if v_rel.reissued_at is not null then
    raise exception 'that number is already carried by someone else';
  end if;
  if v_rel.released_at > now() - interval '90 days' then
    raise exception 'that number is still held until %',
      to_char((v_rel.released_at + interval '90 days') at time zone 'America/New_York', 'Mon DD');
  end if;

  select id into v_holder from public.profiles where member_no = p_number and id <> p_profile;
  if v_holder is not null then
    raise exception 'that number is still on a member record';
  end if;

  update public.profiles set member_no = p_number where id = p_profile;
  update public.member_number_releases
     set reissued_at = now(), reissued_to = p_profile
   where member_no = p_number;
end;
$$;

revoke all on function public.release_member_number(uuid) from public;
revoke all on function public.reissue_member_number(uuid, text) from public;
grant execute on function public.release_member_number(uuid) to authenticated;
grant execute on function public.reissue_member_number(uuid, text) to authenticated;
;
