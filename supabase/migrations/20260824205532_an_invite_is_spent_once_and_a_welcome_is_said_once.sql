-- Round 12 added the `status = 'aboard'` early return here with a comment
-- saying that doing this twice "is a second welcome and a second payout." The
-- comment was right about the harm and the guard only closed the sequential
-- retry — the case where the first call had already committed. Nothing
-- ordered two calls that overlap, because the row was read without a lock.
--
-- Reproduced twice on the unfixed function:
--   Ten concurrent accepts of ONE application: eight got past the early return
--   and eight `welcome-aboard` letters were queued to one applicant.
--   Four applications sharing a max_uses=1 invite, accepted at once: the code
--   ended at uses=2 against max_uses=1, the inviter was paid 500 for a one-use
--   code, and four people landed on the member roll on a code that admits one.
--
-- Two independent unlocked reads, so two fixes:
--
--   THE APPLICATION. `for update` on the select, so the second caller waits and
--   then sees the committed 'aboard' and returns. Plus a `where status <>
--   'aboard'` on the update, so even if the guard were ever removed the write
--   itself refuses to repeat.
--
--   THE INVITE. select-then-update replaced by ONE conditional update with
--   `returning` — the shape `claim_promo_code` has always used and the one
--   every other consumer of a bounded counter in this schema should copy. The
--   bound lives in the same statement that spends it, so there is no window
--   between deciding and doing.
create or replace function public.accept_application(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  a record;
  inv record;
  moved int;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;

  -- The lock is what makes the check below mean anything: a second caller
  -- blocks here and reads the committed row rather than a stale snapshot.
  select * into a from public.applications where id = p_id for update;
  if a.id is null then raise exception 'no such application'; end if;
  if a.status = 'aboard' then return; end if;

  update public.applications
     set status = 'aboard', reviewed_by = auth.uid(), decided_at = now()
   where id = p_id and status <> 'aboard';
  get diagnostics moved = row_count;
  -- Belt to the lock's braces. If this ever matches nothing, someone else did
  -- the welcoming and we must not do it again.
  if moved = 0 then return; end if;

  insert into public.member_roll (email, tier, invite_code, source, approved_by)
  values (lower(a.email), a.tier_requested, a.invite_code, 'application', auth.uid())
  on conflict (email) do nothing;

  insert into public.email_outbox (to_email, template, payload)
  values (a.email, 'welcome-aboard', jsonb_build_object('name', a.full_name, 'tier', a.tier_requested));

  -- Referral signature: 250 fathoms to the inviter when their code joins.
  if a.invite_code is not null then
    update public.invites
       set uses = uses + 1
     where code = upper(a.invite_code)
       and (max_uses is null or uses < max_uses)
    returning * into inv;

    if inv.code is not null then
      insert into public.fathoms_ledger (profile_id, delta, reason)
      values (inv.inviter_id, 250, 'Referral signature — ' || a.full_name || ' came aboard');
      insert into public.notifications (profile_id, kind, title, body)
      values (inv.inviter_id, 'fathoms', '250 fathoms — your signature held.',
              a.full_name || ' is aboard on your word. The ledger remembers.');
    end if;
  end if;
end $function$;

-- `set_application_status(id, 'invited')` had the same shape one door along:
-- repeated clicks queued repeated invitations. accept_application guarded this
-- explicitly and its sibling did not.
create or replace function public.set_application_status(p_id uuid, p_status public.application_status)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare a record; moved int;
begin
  if not public.is_staff() then raise exception 'staff only'; end if;
  select * into a from public.applications where id = p_id for update;
  if a.id is null then raise exception 'no such application'; end if;
  if a.status = p_status then return; end if;

  update public.applications
     set status = p_status,
         reviewed_by = auth.uid(),
         decided_at = case when p_status in ('aboard','declined') then now() else decided_at end
   where id = p_id and status is distinct from p_status;
  get diagnostics moved = row_count;
  if moved = 0 then return; end if;

  if p_status = 'invited' then
    insert into public.email_outbox (to_email, template, payload)
    values (a.email, 'salon-invite', jsonb_build_object('name', a.full_name));
  end if;
end $$;
;
