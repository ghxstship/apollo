/* A hull above the club's figure names its certificate (decided 2026-09-02).

   voyages.hull_ceiling_heads (W9) lets a flotilla seat more than the club's
   forty. A tentpole is allowed; an unnamed one is not: above the club figure
   the sailing must say which vessel, which authority and what certified
   number let it. The trigger reads the club figure from club_settings at the
   moment of the write, so raising the club default later never strands a
   sailing that was honest when it was raised. Below the club figure the
   certificate is optional — the club figure is itself the certificate. */
alter table public.voyages
  add column if not exists hull_certificate text
  check (hull_certificate is null or char_length(btrim(hull_certificate)) between 3 and 200);

comment on column public.voyages.hull_certificate is
  'Vessel, authority and certified heads that allow a ceiling above the club figure — required by a_tentpole_names_its_certificate when hull_ceiling_heads exceeds club_settings.hull_ceiling_heads';

create or replace function public.a_tentpole_names_its_certificate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  club integer := public.club_setting('hull_ceiling_heads');
begin
  if new.hull_ceiling_heads is not null
     and club is not null
     and new.hull_ceiling_heads > club
     and nullif(btrim(coalesce(new.hull_certificate, '')), '') is null then
    raise exception 'a hull above % heads names its certificate — the vessel, the authority and the certified number', club;
  end if;
  return new;
end $$;

revoke all on function public.a_tentpole_names_its_certificate() from public, anon, authenticated;

drop trigger if exists a_tentpole_names_its_certificate on public.voyages;
create trigger a_tentpole_names_its_certificate
  before insert or update of hull_ceiling_heads, hull_certificate on public.voyages
  for each row execute function public.a_tentpole_names_its_certificate();;
