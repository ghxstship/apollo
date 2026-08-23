-- guard_guest_columns carried this comment: "The signing flow writes consent
-- through a definer, which runs as owner and is not caught here." That is
-- false. Triggers fire for the table owner too, so the definer's own
-- `update rsvp_guests set on_camera = ...` was caught by the guard meant to
-- stop the HOST setting it — and every adult guest who left the camera box
-- ticked (the default, and what the form pre-checks) got
-- "that is the guest's to say, not yours", surfaced as the generic "That
-- didn't land. Try again." They could never sign, and
-- require_guest_signature_at_check_in then refused to board them.
--
-- The guard was written from reasoning about how definers behave rather than
-- from trying it. It needs a real signal, so the signing path raises a flag the
-- guard can see, the same way set_own_standing does.
create or replace function public.guard_guest_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then return new; end if;

  -- Set only inside sign_document_as_guest, and only for the length of that
  -- transaction. It is the guest answering, through the link that is theirs.
  if coalesce(current_setting('app.guest_signing', true), 'off') = 'on' then
    return new;
  end if;

  if new.on_camera is distinct from old.on_camera then
    raise exception 'that is the guest''s to say, not yours';
  end if;
  if new.boarding_code is distinct from old.boarding_code
     or new.sign_token is distinct from old.sign_token
     or new.rsvp_id is distinct from old.rsvp_id then
    raise exception 'a guest pass is issued by the club';
  end if;
  return new;
end;
$$;

-- Raise the flag around the one write, and lower it immediately.
do $outer$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sign_document_as_guest' limit 1;

  newsrc := replace(src,
    'update public.rsvp_guests set on_camera = coalesce(p_on_camera, false) where id = g.id;',
    'perform set_config(''app.guest_signing'', ''on'', true);'  || chr(10) ||
    '  update public.rsvp_guests set on_camera = coalesce(p_on_camera, false) where id = g.id;' || chr(10) ||
    '  perform set_config(''app.guest_signing'', ''off'', true);');

  if newsrc = src then
    raise exception 'the on_camera write was not found in sign_document_as_guest';
  end if;
  execute newsrc;
end $outer$;;
