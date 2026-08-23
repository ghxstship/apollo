-- The guest waiver states, in the text the guest signs, that a guest may decline
-- to appear and that a minor "appears on camera only with the signing adult's
-- explicit consent, given here … the default is off". None of that was true:
-- rsvp_guests.on_camera defaulted to TRUE, the signing flow never wrote it, and
-- the crew sheet never read it.
alter table public.rsvp_guests alter column on_camera set default false;

comment on column public.rsvp_guests.on_camera is
  'The guest''s own filming consent, captured at signing. Off until stated — the waiver says so.';

update public.rsvp_guests g
set on_camera = false
where g.on_camera
  and not exists (select 1 from public.signatures s where s.guest_id = g.id);

do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sign_document_as_guest' limit 1;
  if src is null then raise exception 'sign_document_as_guest not found'; end if;

  newsrc := replace(src,
    'p_user_agent text DEFAULT NULL::text)',
    'p_user_agent text DEFAULT NULL::text, p_on_camera boolean DEFAULT false)');
  if newsrc = src then raise exception 'signature anchor not found'; end if;
  src := newsrc;

  newsrc := replace(src, 'return sig_id;',
    'update public.rsvp_guests set on_camera = coalesce(p_on_camera, false) where id = g.id;' || chr(10) ||
    '  return sig_id;');
  if newsrc = src then raise exception 'return anchor not found'; end if;
  execute newsrc;
end $$;

revoke execute on function public.sign_document_as_guest(uuid, text, boolean, text, text, text, text, text, text, boolean) from public;
grant execute on function public.sign_document_as_guest(uuid, text, boolean, text, text, text, text, text, text, boolean) to anon, authenticated;
