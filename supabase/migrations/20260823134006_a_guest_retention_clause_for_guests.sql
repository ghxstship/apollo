-- The guest waiver carried the member-audience retention clause verbatim: "the
-- club keeps your membership record … for as long as you are a member". A guest
-- has no membership record and never becomes a member, so the stated retention
-- period has neither a start nor an end for them. Clauses are immutable, so this
-- is a new clause swapped into a fresh published version.
insert into public.clauses (code, title, category, position, active)
values ('data-notice-guest', 'What the club records — guest', 'privacy', 8, true)
on conflict (code) do nothing;

insert into public.clause_versions (clause_code, version, body, published_at)
select 'data-notice-guest', 1,
  'What the club records. The club keeps your name, the sailing you attended and this agreement '
  || 'for six years from the date of that sailing, so that a claim can be answered. Nothing else is '
  || 'kept about you, and you are not enrolled in anything by signing. You may ask what is held, ask '
  || 'for it to be corrected, or ask for it to be erased — where a record is needed to answer a legal '
  || 'claim, the club redacts the person and keeps the proof. Write to Shoreside.',
  now()
where not exists (select 1 from public.clause_versions where clause_code='data-notice-guest' and version=1);

do $$
declare v_old uuid; v_new uuid; v_next int;
begin
  select id into v_old from public.document_versions
  where document_code = 'guest-waiver' and status = 'published' limit 1;
  if v_old is null then raise exception 'no published guest waiver'; end if;
  select coalesce(max(version),0)+1 into v_next from public.document_versions where document_code='guest-waiver';

  insert into public.document_versions (document_code, version, status)
  values ('guest-waiver', v_next, 'draft') returning id into v_new;

  insert into public.document_clauses (document_version_id, clause_version_id, position, condition)
  select v_new,
         case when cv.clause_code = 'data-notice'
              then (select id from public.clause_versions where clause_code='data-notice-guest' and version=1)
              else dc.clause_version_id end,
         dc.position, dc.condition
  from public.document_clauses dc
  join public.clause_versions cv on cv.id = dc.clause_version_id
  where dc.document_version_id = v_old;

  update public.document_versions set status='retired' where id = v_old;
  update public.document_versions set status='published', published_at=now(), effective_from=now() where id = v_new;
end $$;
