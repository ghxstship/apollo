-- Two Bridge writes could never have worked. notifications has no INSERT
-- policy and email_outbox has none either (both are definer-only by design),
-- but the moderation and refund actions inserted into them with the caller's
-- RLS client and discarded the error. So "Removed, author notified with the
-- reason" was a lie on every removal — the author was never told, which is the
-- exact opposite of the contract ("never silently") — and no refund receipt was
-- ever queued.
--
-- Give the Bridge two staff-only definers to speak through, and let the actions
-- check their errors.
create or replace function public.notify_member(
  p_profile uuid,
  p_kind    text,
  p_title   text,
  p_body    text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'a word needs a title'; end if;
  if not exists (select 1 from public.profiles where id = p_profile) then
    raise exception 'no such member';
  end if;

  insert into public.notifications (profile_id, kind, title, body)
  values (p_profile, coalesce(nullif(btrim(p_kind), ''), 'word'), btrim(p_title), btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.notify_member(uuid, text, text, text) from public, anon;
grant execute on function public.notify_member(uuid, text, text, text) to authenticated;

comment on function public.notify_member(uuid, text, text, text) is
  'Staff-only. The Bridge''s way to put a word in a member''s Word — notifications is definer-write only.';

create or replace function public.queue_email(
  p_to       text,
  p_template text,
  p_payload  jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  if coalesce(btrim(p_to), '') = '' then raise exception 'an email needs an address'; end if;
  if coalesce(btrim(p_template), '') = '' then raise exception 'an email needs a template'; end if;

  insert into public.email_outbox (to_email, template, payload)
  values (btrim(p_to), btrim(p_template), coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.queue_email(text, text, jsonb) from public, anon;
grant execute on function public.queue_email(text, text, jsonb) to authenticated;

comment on function public.queue_email(text, text, jsonb) is
  'Staff-only. Queues one shoreside email; email_outbox is definer-write only.';
