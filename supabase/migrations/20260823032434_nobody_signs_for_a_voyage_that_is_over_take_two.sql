-- The reader says a sailing has gone; the writer must refuse it too, so a stale
-- bearer link cannot record a new binding signature against a voyage that is
-- finished or called off. Patched in place so nothing else in this much-guarded
-- function can drift, and it raises rather than pretending if the anchor moves.
do $$
declare src text; newsrc text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sign_document_as_guest' limit 1;

  if src is null then raise exception 'sign_document_as_guest not found'; end if;

  newsrc := replace(
    src,
    'if not found then raise exception ''that link is not recognised''; end if;',
    'if not found then raise exception ''that link is not recognised''; end if;' || chr(10) || chr(10) ||
    '  -- A stale bearer link must not record a new binding signature against a' || chr(10) ||
    '  -- sailing that is finished or called off.' || chr(10) ||
    '  if not public.guest_may_still_sign(p_token) then' || chr(10) ||
    '    raise exception ''that sailing has gone — there is nothing left to sign'';' || chr(10) ||
    '  end if;'
  );

  if newsrc = src then
    raise exception 'anchor not found — refusing to pretend this worked';
  end if;
  execute newsrc;
end $$;
