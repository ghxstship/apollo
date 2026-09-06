-- A pass leaves a record, and the log is swept (decided 2026-09-06).
--
-- audit_log has covered the club's reference data since 2026-09-01 — episodes,
-- settings, plans, products, cabins — and since 2026-09-06 the five credential
-- tables. Passes were never on either list, and passes are where the club's
-- disputes actually live: who moved a member off a cabin, who marked a guest
-- count down from three to one, who unstamped a pass that had been checked in,
-- who deleted the row that was on the manifest an hour ago. Twenty-four
-- triggers already fire on this table and not one of them remembers anything.
--
-- WHY THIS IS NOT record_the_change. That function writes a full row image on
-- both sides of every change, which is right for a table of ninety products
-- and wrong for this one: passes will be the largest table in the schema, a
-- pass row carries twenty-one columns, and a season of stamping every pass at
-- the gangway would write a trail several times the size of the thing it
-- audits. Nor can record_the_change be given a column set — it takes no
-- arguments and there is no honest way to add one without touching the
-- fourteen tables already hanging off it.
--
-- So this is a sibling, in the shape record_the_change_without_the_secret
-- already established on 2026-09-06: the same log line, the same table, the
-- same actor, with the images narrowed. It reads its columns from TG_ARGV, so
-- the column set lives on the trigger where a reader of the trigger can see
-- it, and one function serves any table that wants the same treatment.
--
-- SIX COLUMNS, and the volume argument is the whole reason for the number:
--   status        — aboard, released, waitlisted, no-show
--   guests        — the count the club is seating and charging for
--   checked_in_at — the stamp at the gangway
--   cabin_id      — which cabin, on a sailing that has them
--   vessel_id     — which hull
--   standby       — in the count, or waiting for a seat to free
-- Everything else on a pass either never changes (episode_id, profile_id,
-- created_at), is a credential that does not belong in a staff-readable log
-- (boarding_code), or is settled elsewhere in the book (promo_code, comp,
-- sponsor_id, all of which move money and move it through account_ledger).
--
-- INSERT is deliberately not audited. A pass being taken is already a row with
-- a created_at on it, in a table nobody can delete from without passing this
-- same trigger; logging its birth would double the largest table in the schema
-- to record a fact the table already states.
--
-- AND THE LOG IS SWEPT. Nothing has ever deleted from audit_log — eighteen
-- thousand rows today, and passes will outpace that in a season. 400 days
-- rather than 365: a full annual cycle plus margin, so a dispute about last
-- year's season opener can still be answered while this year's is being
-- planned. It goes in cron_purge_expired_records with every other retention
-- rule the club keeps in one place.

-- ── 1 · The sibling ─────────────────────────────────────────────────────────
create or replace function public.record_the_change_in_these_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  cols  text[] := tg_argv;
  bfull jsonb;
  afull jsonb;
  b     jsonb;
  a     jsonb;
begin
  if array_length(cols, 1) is null then
    raise exception 'record_the_change_in_these_columns is given the columns it records';
  end if;

  if tg_op in ('UPDATE','DELETE') then bfull := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then afull := to_jsonb(new); end if;

  -- jsonb_each is strict, so a null image yields no rows and a null image out.
  select jsonb_object_agg(e.key, e.value) into b from jsonb_each(bfull) e where e.key = any(cols);
  select jsonb_object_agg(e.key, e.value) into a from jsonb_each(afull) e where e.key = any(cols);

  -- The volume control. An update that moves none of the named columns is not
  -- a change this log is about, and on a table of this size that is most of
  -- them: a wallet push, a manifest flag, a memo.
  if tg_op = 'UPDATE' and a is not distinct from b then return new; end if;

  insert into public.audit_log (table_name, row_id, action, actor_id, before, after)
  values (tg_table_name, coalesce(afull->>'id', bfull->>'id'), tg_op, auth.uid(), b, a);
  return coalesce(new, old);
end $fn$;

revoke execute on function public.record_the_change_in_these_columns()
  from public, anon, authenticated;

comment on function public.record_the_change_in_these_columns() is
  'record_the_change for a table too large to carry a full row image. The trigger names the columns that mean something and both images hold those and nothing else; an update that moves none of them writes no line at all.';

-- ── 2 · The trigger on passes ───────────────────────────────────────────────
drop trigger if exists zz_record_the_change on public.passes;
create trigger zz_record_the_change
  after update or delete on public.passes
  for each row execute function public.record_the_change_in_these_columns(
    'status', 'guests', 'checked_in_at', 'cabin_id', 'vessel_id', 'standby');

-- ── 3 · How long the log is kept ────────────────────────────────────────────
alter table public.club_settings disable trigger zz_record_the_change;
insert into public.club_settings (key, value_int, note) values
  ('audit_retention_days', 400,
   'An audit_log line is kept this long. A full annual cycle plus margin, so last season can still be answered for while this one is being planned')
on conflict (key) do nothing;
alter table public.club_settings enable trigger zz_record_the_change;

-- ── 4 · The sweep ───────────────────────────────────────────────────────────
-- Patched onto the existing retention run rather than replaced wholesale: this
-- function has been rewritten twice already and is being extended again in the
-- same wave, and a full create-or-replace here would silently drop whatever
-- landed between the read and the write. Anchored, so it refuses rather than
-- guesses if the body has moved, and idempotent, so replaying it is a no-op.
do $do$
declare
  src    text;
  anchor text := E'  perform public.erase_departed_profiles();';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'cron_purge_expired_records'
     and p.pronamespace = 'public'::regnamespace;
  if src is null then
    raise exception 'cron_purge_expired_records is not there to patch';
  end if;
  if position('audit_retention_days' in src) > 0 then return; end if;
  if position(anchor in src) = 0 then
    raise exception 'cron_purge_expired_records: anchor missing — re-read before patching';
  end if;
  src := replace(src, anchor,
    E'  delete from public.audit_log\n'
    || E'   where at < now() - make_interval(days => coalesce(public.club_setting(''audit_retention_days''), 400));\n'
    || anchor);
  execute src;
end $do$;
