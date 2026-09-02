-- operations.md §5: the Presenting Partner carries two VIP passes a week and
-- every tier an asset inventory. A comp for a sponsor is a comp pass that
-- remembers the sponsor; the activation records which assets were delivered.
alter table public.rsvps add column if not exists sponsor_id uuid references public.sponsors(id) on delete set null;
alter table public.voyage_sponsors add column if not exists assets_delivered text[] not null default '{}';

create or replace function public.comp_a_pass_for_sponsor(p_voyage uuid, p_sponsor uuid, p_profile uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare rid uuid;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if not exists (select 1 from public.voyage_sponsors vs where vs.voyage_id = p_voyage and vs.sponsor_id = p_sponsor) then
    raise exception 'that sponsor is not on this sailing — place the activation first';
  end if;
  if exists (select 1 from public.rsvps r where r.voyage_id = p_voyage and r.profile_id = p_profile and r.status = 'aboard') then
    raise exception 'that member already holds a pass on this sailing';
  end if;
  insert into public.rsvps (voyage_id, profile_id, status, comp, sponsor_id)
  values (p_voyage, p_profile, 'aboard', true, p_sponsor)
  on conflict (voyage_id, profile_id) do update
    set status = 'aboard', comp = true, sponsor_id = excluded.sponsor_id
  returning id into rid;
  return rid;
end $$;
grant execute on function public.comp_a_pass_for_sponsor(uuid, uuid, uuid) to authenticated;;
