-- profiles.waiver_signed_at was the old answer to "has this person signed?" and
-- the signatures table is the new one. Two answers to one question is precisely
-- what normalisation forbids, and the old column cannot answer the parts that
-- matter anyway — which document, which wording, when it lapses.
--
-- The column goes. Everything that read it now reads this view, which derives
-- the standing from the record rather than duplicating it.

create or replace view public.member_waiver_standing
with (security_invoker = on) as
select
  p.id                                             as profile_id,
  s.signed_at,
  case when d.validity_months is null then null
       else s.signed_at + make_interval(months => d.validity_months) end as expires_at,
  s.id is not null
    and (d.validity_months is null
         or s.signed_at + make_interval(months => d.validity_months) > now()) as current
from public.profiles p
left join public.documents d
       on d.code = 'member-waiver'
left join public.document_versions dv
       on dv.document_code = d.code and dv.status = 'published'
left join public.signatures s
       on s.document_version_id = dv.id and s.profile_id = p.id;

comment on view public.member_waiver_standing is
  'Derived, never stored: a member waiver stands when it is against the published version and inside its validity window.';

-- The gangway and the manifests read this, so members must be able to read
-- their own row; RLS on signatures does the scoping because the view is
-- security_invoker.
grant select on public.member_waiver_standing to authenticated;

alter table public.profiles drop column if exists waiver_signed_at;
