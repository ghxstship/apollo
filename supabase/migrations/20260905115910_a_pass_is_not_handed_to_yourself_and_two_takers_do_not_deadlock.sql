-- Three races the money tests reproduced.
--
-- A self-offer: pass_transfers had no from <> to rule and accept_pass_transfer
-- never asked; only the TypeScript action refused, so a REST insert wrote one.
alter table public.pass_transfers
  add constraint pass_transfers_not_to_self check (from_profile <> to_profile);

-- Two takers accepting at once: each locked its own offer row, then waited on
-- the pass; the winner then voided the other offer, which the loser held —
-- Postgres killed one and the loser read "Deadlock detected." The money was
-- right; the words were not. Lock the pass first, so the second taker queues
-- behind the first and then finds a void offer, which the function already
-- explains in its own words. And refuse a self-offer here too.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'accept_pass_transfer' and p.pronamespace = 'public'::regnamespace;
  if src not like '%begin
  select * into t from public.pass_transfers
   where id = p_id and status = ''offered''
   for update;
  if t.id is null then raise exception ''no offer to accept''; end if;%' then
    raise exception 'accept_pass_transfer: anchor missing — re-read before patching';
  end if;
  src := replace(src, 'begin
  select * into t from public.pass_transfers
   where id = p_id and status = ''offered''
   for update;
  if t.id is null then raise exception ''no offer to accept''; end if;',
'begin
  perform pg_advisory_xact_lock(hashtext(''pass:'' || coalesce((select x.rsvp_id::text from public.pass_transfers x where x.id = p_id), p_id::text)));
  select * into t from public.pass_transfers
   where id = p_id and status = ''offered''
   for update;
  if t.id is null then raise exception ''no offer to accept''; end if;
  if t.from_profile = t.to_profile then raise exception ''a pass cannot be handed to yourself''; end if;');
  execute src;
end $$;

-- The same add-on attached twice at once: the second passed the not-exists
-- check and hit the primary key, and the member read a raw duplicate-key
-- error. One line, one charge, and the second try is simply nothing.
do $$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p where p.proname = 'attach_addons' and p.pronamespace = 'public'::regnamespace;
  if src not like '%    insert into public.pass_addons (rsvp_id, addon_id, qty) values (p_pass, r.id, v_qty);
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id, created_by)
    values (v_uid, -(r.price_cents * v_qty), ''addon'', r.name, r.episode_id, p_pass, v_uid);
    n := n + 1;%' then
    raise exception 'attach_addons: anchor missing — re-read before patching';
  end if;
  src := replace(src, '    insert into public.pass_addons (rsvp_id, addon_id, qty) values (p_pass, r.id, v_qty);
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id, created_by)
    values (v_uid, -(r.price_cents * v_qty), ''addon'', r.name, r.episode_id, p_pass, v_uid);
    n := n + 1;',
'    insert into public.pass_addons (rsvp_id, addon_id, qty) values (p_pass, r.id, v_qty)
    on conflict (rsvp_id, addon_id) do nothing;
    if found then
      insert into public.account_ledger (profile_id, delta_cents, kind, memo, episode_id, rsvp_id, created_by)
      values (v_uid, -(r.price_cents * v_qty), ''addon'', r.name, r.episode_id, p_pass, v_uid);
      n := n + 1;
    end if;');
  execute src;
end $$;;
