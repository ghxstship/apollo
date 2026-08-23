-- Making a guest row outlive its pass broke the path next to it. Codes are
-- derived per pass (…-G1, …-G2) and boarding_code is globally unique, so a
-- detached guest kept holding the code its slot would be issued again — and
-- sync_guest_rows silently dropped the next guest on `on conflict do nothing`.
create or replace function public.detached_guest_returns_its_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.rsvp_id is null and old.rsvp_id is not null then
    new.boarding_code := null;
    new.checked_in_at := null;
    new.checked_in_by := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.detached_guest_returns_its_code() from public, anon, authenticated;

drop trigger if exists detached_guest_returns_its_code on public.rsvp_guests;
create trigger detached_guest_returns_its_code
  before update of rsvp_id on public.rsvp_guests
  for each row execute function public.detached_guest_returns_its_code();

update public.rsvp_guests
set boarding_code = null, checked_in_at = null, checked_in_by = null
where rsvp_id is null and boarding_code is not null;

comment on column public.rsvp_guests.boarding_code is
  'The code for a guest on a pass. Null once detached — the slot is free for whoever the pass names next.';
