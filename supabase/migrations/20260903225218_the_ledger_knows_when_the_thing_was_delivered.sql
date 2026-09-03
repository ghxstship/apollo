-- account_ledger has only ever carried created_at — when the club BILLED. A
-- season of fifty-two episodes is sold months ahead, so on the current reports
-- a pass sold in September for a March episode is September revenue, and the
-- house-revenue figure is really a cash-collected figure wearing a revenue
-- label. Across a season sold in advance that is the single largest distortion
-- in the numbers.
--
-- service_date is when the club owes the thing: the night the episode runs, or
-- the period the dues cover. Billed and earned become two different questions
-- that can finally be asked separately, and the gap between them is deferred
-- revenue — a liability, not income.
alter table public.account_ledger
  add column if not exists service_date date;

comment on column public.account_ledger.service_date is
  'When the club delivers what this row charges for — the episode night, or the dues period. created_at is when it was billed. The difference between them is deferred revenue.';

create index if not exists account_ledger_service_date
  on public.account_ledger (service_date) where service_date is not null;

/* Set from the episode where there is one, which is most of the money. A row
   with no episode and no period keeps a null service_date and is recognised
   when billed — correct for a shop order or a bar tab, which are delivered on
   the spot. */
create or replace function public.stamp_the_service_date()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.service_date is null and new.episode_id is not null then
    select (e.starts_at at time zone e.time_zone)::date into new.service_date
    from public.episodes e where e.id = new.episode_id;
  end if;
  return new;
end $$;

drop trigger if exists a_ledger_row_says_when_it_is_earned on public.account_ledger;
create trigger a_ledger_row_says_when_it_is_earned
  before insert on public.account_ledger
  for each row execute function public.stamp_the_service_date();

revoke execute on function public.stamp_the_service_date() from public, anon, authenticated;

-- Backfill what is already on the books, so the first report that splits billed
-- from earned is not split against a mostly-empty column.
update public.account_ledger l
set service_date = (e.starts_at at time zone e.time_zone)::date
from public.episodes e
where l.episode_id = e.id and l.service_date is null;;
