-- The policy was right about the row and wrong about the columns: a member
-- could read their own countersignature, which carries signed_ip and
-- user_agent — the countersigning officer's IP address, handed to the member
-- whose contract they signed. RLS has no column granularity, so the row has to
-- stop being member-readable and the member-facing shape has to be its own
-- object. Nothing in the app reads this table except the Bridge; members read
-- agreement_standing, which already shows only the officer's name.
drop policy if exists "own or staff counter-signatures" on public.counter_signatures;

create policy "staff read counter-signatures" on public.counter_signatures
  for select to authenticated
  using (public.is_staff());

-- What a member is actually owed: that it was countersigned, by whom, when.
create or replace view public.own_counter_signature
with (security_invoker = false) as
  select c.signature_id,
         c.signer_name,
         c.signer_title,
         c.signed_at
  from public.counter_signatures c
  join public.signatures s on s.id = c.signature_id
  where s.profile_id = auth.uid();

comment on view public.own_counter_signature is
  'Your own countersignature, without the officer''s IP or user agent. The base table is staff-only because RLS cannot withhold a column.';

revoke all on public.own_counter_signature from anon, authenticated;
grant select on public.own_counter_signature to authenticated;;
