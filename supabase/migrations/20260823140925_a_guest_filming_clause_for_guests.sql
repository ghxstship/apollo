-- The guest waiver served the member-audience filming clause verbatim: "tell the
-- crew before boarding or toggle it in your settings". A guest has no account and
-- no settings page, so the document promised a route that does not exist for the
-- person signing it.
insert into public.clauses (code, title, category, position, active)
values ('filming-release-guest', 'Appearance and filming — guest', 'media', 91, true)
on conflict (code) do nothing;

insert into public.clause_versions (clause_code, version, body, published_at)
select 'filming-release-guest', 1,
  'Appearance and filming. The cameras run from boarding to docking. By boarding you agree to be '
  || 'filmed and photographed, and to the use of that footage in the show and its promotion. You may '
  || 'decline to appear: untick the camera box on this form, or tell the crew before boarding, and '
  || 'production will keep you out of frame and out of the cut. To change your mind afterwards, write '
  || 'to Shoreside.',
  now()
where not exists (select 1 from public.clause_versions where clause_code='filming-release-guest' and version=1);

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
         case when cv.clause_code = 'filming-release'
              then (select id from public.clause_versions where clause_code='filming-release-guest' and version=1)
              else dc.clause_version_id end,
         dc.position, dc.condition
  from public.document_clauses dc
  join public.clause_versions cv on cv.id = dc.clause_version_id
  where dc.document_version_id = v_old;

  update public.document_versions set status='retired' where id = v_old;
  update public.document_versions set status='published', published_at=now(), effective_from=now() where id = v_new;
end $$;
