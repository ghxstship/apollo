-- account_ledger_idem_key_once is a PARTIAL unique index (WHERE idem_key IS NOT
-- NULL). Postgres will only infer a partial index for ON CONFLICT if the
-- predicate is restated in the clause, and this one did not restate it — so the
-- INSERT failed at PLAN time, whether or not any row conflicted:
--   ERROR: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- It is an AFTER trigger inside the caller's transaction, so the failure was not
-- confined to the credit: the whole `update voyages set status='completed'`
-- aborted, taking handle_voyage_status, confer_marks_on_completion and
-- close_threads_when_the_sailing_ends with it. No Radar sailing could be closed
-- out at all, and nobody owed the $150 could be paid.
--
-- join_crew_thread already restates its predicate correctly against
-- threads_one_crew_per_voyage; this was the one site that did not.
create or replace function public.settle_the_match_guarantee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  clock record;
  paid  integer := 0;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;

  select * into clock from public.voyage_radar where voyage_id = new.id;
  if clock.voyage_id is null or clock.settled_at is not null then return new; end if;

  -- The index is partial, so the predicate has to be restated here for Postgres
  -- to infer it. Without the WHERE this does not merely fail to dedupe — it
  -- refuses to plan.
  insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id, idem_key)
  select r.profile_id, 15000, 'credit',
         'Match Guarantee — no shared anchors on this sailing.',
         new.id, r.id,
         'match-guarantee:' || new.id::text || ':' || r.id::text
  from public.rsvps r
  where r.voyage_id = new.id and r.status = 'aboard'
    and exists (select 1 from public.radar_picks p
                where p.voyage_id = new.id and p.picker_rsvp = r.id)
    and not exists (select 1 from public.shared_anchors a
                    where a.voyage_id = new.id and (a.rsvp_a = r.id or a.rsvp_b = r.id))
  on conflict (idem_key) where idem_key is not null do nothing;
  get diagnostics paid = row_count;

  insert into public.notifications (profile_id, kind, title, body)
  select r.profile_id, 'word', 'No anchors this time',
         'That happens, and it is on us. A $150 credit is already on your next sailing — no form, no request.'
  from public.rsvps r
  join public.account_ledger l on l.rsvp_id = r.id
    and l.idem_key = 'match-guarantee:' || new.id::text || ':' || r.id::text
  where r.voyage_id = new.id and l.created_at > now() - interval '1 minute';

  update public.voyage_radar set settled_at = now() where voyage_id = new.id;
  return new;
end $function$;

-- Prove the statement plans. A partial-index inference failure is a plan-time
-- error, so preparing the shape is enough to catch it and needs no fixture.
do $$
begin
  execute 'prepare _guarantee_plan_check as
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, idem_key)
    values ($1, 0, ''credit'', ''plan check'', $2)
    on conflict (idem_key) where idem_key is not null do nothing';
  deallocate _guarantee_plan_check;
exception when others then
  raise exception 'the guarantee insert still does not plan against the partial index: %', sqlerrm;
end $$;;
