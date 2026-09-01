-- apply_with_invite silently nulled a well-formed but unknown or spent code and
-- returned success: the applicant read "Application received", the sponsor's
-- vouch evaporated, and nobody was told. The exact silent-failure class this
-- campaign exists to kill. A dead code now refuses, and names the way out —
-- the caller (membership/actions.ts) already hands RPC refusals to the invite
-- field in the brand's voice.
do $$
declare
  src text := pg_get_functiondef('public.apply_with_invite(text,text,text,text,text)'::regprocedure);
  anchor text := $a$  insert into public.applications (full_name, email, city, note, invite_code, status)
  values (v_name, v_email, v_city, v_note,
          case when v_valid then upper(btrim(p_code)) else null end, 'received')$a$;
begin
  if position(anchor in src) = 0 then
    raise exception 'anchor missing: the valid-else-null insert — read the live function before patching';
  end if;

  src := replace(src, anchor, $a$  if not v_valid then
    raise exception 'that code doesn''t answer — check it against the note it came with, or apply without one';
  end if;

  insert into public.applications (full_name, email, city, note, invite_code, status)
  values (v_name, v_email, v_city, v_note, upper(btrim(p_code)), 'received')$a$);

  execute src;
end $$;;
