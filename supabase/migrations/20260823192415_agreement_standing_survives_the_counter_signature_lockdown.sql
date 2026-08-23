-- Breakage next door: making counter_signatures staff-only stopped the member
-- reading the officer's IP, and also stopped agreement_standing from seeing
-- the counter-signature at all. The view is security_invoker and LEFT JOINs
-- that table, so `in_force` silently flipped to false on every contract that
-- was, in fact, in force — the member's own page would have told them their
-- membership agreement was not binding.
--
-- The view becomes a definer, which means it has to do its own scoping rather
-- than inheriting the member's policies. It still exposes only the officer's
-- name and the date, never the IP.
create or replace view public.agreement_standing
with (security_invoker = false) as
  select s.id as signature_id,
         s.profile_id,
         d.code as document_code,
         d.title,
         d.kind,
         s.signed_at,
         cs.signed_at   as counter_signed_at,
         cs.signer_name as counter_signed_by,
         case when d.kind <> 'contract' then true
              else cs.signature_id is not null
         end as in_force
  from public.signatures s
  join public.document_versions dv on dv.id = s.document_version_id
  join public.documents d on d.code = dv.document_code
  left join public.counter_signatures cs on cs.signature_id = s.id
  where s.profile_id = auth.uid() or public.is_staff();

comment on view public.agreement_standing is
  'Where a member stands on each document. A definer, because it must see counter_signatures — which members may not read, since the row carries the countersigning officer''s IP. It scopes itself to the caller.';

revoke all on public.agreement_standing from anon, authenticated;
grant select on public.agreement_standing to authenticated;

do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'security_report' limit 1;

  newsrc := replace(src,
    'or c.relname in (''voyage_capacity'', ''member_directory'', ''own_counter_signature'')',
    'or c.relname in (''voyage_capacity'', ''member_directory'', ''own_counter_signature'', ''agreement_standing'')');

  if newsrc = src then
    raise exception 'view_security_invoker whitelist not found — check security_report';
  end if;
  execute newsrc;
end $$;;
