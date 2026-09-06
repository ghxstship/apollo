-- The audit trail was reported as covering none of the money path and none of
-- the pass path. It covers neither, and for most of that the answer is that it
-- should not.
--
-- THE LEDGER IS THE AUDIT TRAIL FOR MONEY. account_ledger is append-only in
-- practice and now in the schema: a_posted_line_does_not_move freezes
-- delta_cents, kind, stripe_ref and profile_id on UPDATE, every row carries
-- created_by, and a correction is another line rather than an edit. Recording
-- it a second time in audit_log would double the write volume of the busiest
-- money table to store a copy of a row that cannot change. The same argument
-- retires signatures, counter_signatures, clause_versions and
-- document_versions: each already has a rewrite guard and its own actor
-- column, and the row IS the record.
--
-- WHAT GENUINELY HAS NO RECORD is a state a person flips by hand that nothing
-- else witnesses. Five of those:
--   api_keys.revoked      — a credential issued and withdrawn, and nothing at
--                           all says who withdrew it or when
--   promo_codes.active    — turning a code off, or moving its ceiling
--   door_grants           — who was given a door, for which night, until when,
--                           and who took it away again
--   subscriptions.status  — a membership cancelled or let lapse
--   installment_plans.status — a plan defaulted or cancelled
-- All five are low volume and configuration-shaped, which is exactly what
-- record_the_change was built for.
--
-- AND THE TRIGGER DOES NOT QUITE GENERALISE. It resolves a row's key from
-- id, slug, key or city_id. promo_codes is keyed on code and has none of
-- those, so it would have recorded every change against a null row_id — a log
-- line that cannot be joined back to the row it describes, which the Bridge's
-- audit-line reader looks up by exactly that pair. So the chain learns about
-- code, appended last so no table already covered changes which column it
-- answers with.
create or replace function public.record_the_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b jsonb; a jsonb; rid text;
begin
  if tg_op in ('UPDATE','DELETE') then b := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then a := to_jsonb(new); end if;
  rid := coalesce(a->>'id', b->>'id', a->>'slug', b->>'slug', a->>'key', b->>'key',
                  a->>'city_id', b->>'city_id', a->>'code', b->>'code');
  if tg_op = 'UPDATE' and a = b then return new; end if;
  insert into public.audit_log (table_name, row_id, action, actor_id, before, after)
  values (tg_table_name, rid, tg_op, auth.uid(), b, a);
  return coalesce(new, old);
end $function$;

do $do$
declare t text;
begin
  foreach t in array array['api_keys','promo_codes','door_grants','subscriptions','installment_plans']
  loop
    execute format('drop trigger if exists zz_record_the_change on public.%I', t);
    execute format('create trigger zz_record_the_change after insert or delete or update on public.%I
                      for each row execute function public.record_the_change()', t);
  end loop;
end $do$;

-- api_keys.key_hash is the credential itself. The log is staff-readable, so
-- the before/after images must not carry it out of the table it lives in.
create or replace function public.record_the_change_without_the_secret()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare b jsonb; a jsonb;
begin
  if tg_op in ('UPDATE','DELETE') then b := to_jsonb(old) - 'key_hash'; end if;
  if tg_op in ('INSERT','UPDATE') then a := to_jsonb(new) - 'key_hash'; end if;
  if tg_op = 'UPDATE' and a = b then return new; end if;
  insert into public.audit_log (table_name, row_id, action, actor_id, before, after)
  values (tg_table_name, coalesce(a->>'id', b->>'id'), tg_op, auth.uid(), b, a);
  return coalesce(new, old);
end $function$;
revoke execute on function public.record_the_change_without_the_secret() from public, anon, authenticated;

drop trigger if exists zz_record_the_change on public.api_keys;
create trigger zz_record_the_change after insert or delete or update on public.api_keys
  for each row execute function public.record_the_change_without_the_secret();

comment on function public.record_the_change_without_the_secret() is
  'record_the_change for a table whose row holds a credential. Same log line, with key_hash struck from both images: the Bridge may read the log, and the log is not where a key hash belongs.';
