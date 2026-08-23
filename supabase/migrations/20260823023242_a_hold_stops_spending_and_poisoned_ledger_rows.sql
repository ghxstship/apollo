-- redeem_reward reached its balance check while held, so the hold on knots
-- spending was client-side only.
create or replace function public.redeem_reward(p_reward uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  me    uuid := auth.uid();
  rw    record;
  bal   int;
  taken int;
begin
  if me is null then raise exception 'sign in first'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;

  perform pg_advisory_xact_lock(hashtext(me::text));

  select * into rw from public.rewards where id = p_reward and active;
  if rw.id is null then raise exception 'no such reward'; end if;

  select coalesce(sum(delta), 0) into bal
  from public.fathoms_ledger where profile_id = me;
  if bal < rw.cost_fm then
    raise exception 'not enough knots: % held, % needed', bal, rw.cost_fm;
  end if;

  if rw.stock is not null then
    select count(*) into taken from public.reward_redemptions where reward_id = rw.id;
    if taken >= rw.stock then raise exception 'that one is spoken for'; end if;
  end if;

  insert into public.reward_redemptions (profile_id, reward_id) values (me, rw.id);
  insert into public.fathoms_ledger (profile_id, delta, reason)
  values (me, -rw.cost_fm, 'Redeemed — ' || rw.name);
  insert into public.notifications (profile_id, kind, title, body)
  values (me, 'fathoms', 'Redeemed — ' || rw.name, 'Shoreside will arrange it.');
end;
$function$;

-- "member posts own charges" let a member attach a negative row to ANY rsvp,
-- including another member's, and carried no hold gate.
alter policy "member posts own charges" on public.account_ledger
with check (
  profile_id = auth.uid()
  and public.is_active()
  and delta_cents <= 0
  and kind = any (array['berth','deposit','addon','galley','chandlery'])
  and (
    rsvp_id is null
    or exists (select 1 from public.rsvps r where r.id = rsvp_id and r.profile_id = auth.uid())
  )
);

-- accept_pass_transfer settled by summing every negative ledger row against the
-- pass, with no author filter — so a member could post -500000 on their own
-- pass, hand it over, and mint themselves a credit while the charge landed on
-- whoever accepted. The settle is capped at what the pass could have cost.
create or replace function public.accept_pass_transfer(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t record; v record; net int; cap int; m text; new_code text;
begin
  select * into t from public.pass_transfers where id = p_id and status = 'offered';
  if t.id is null then raise exception 'no offer to accept'; end if;
  if t.to_profile <> auth.uid() then raise exception 'that offer is not yours'; end if;
  if not public.is_active() then raise exception 'your membership is on hold'; end if;

  select v2.* into v from public.rsvps r join public.voyages v2 on v2.id = r.voyage_id where r.id = t.rsvp_id;

  select coalesce(-sum(delta_cents), 0) into net from public.account_ledger
   where rsvp_id = t.rsvp_id and delta_cents < 0 and profile_id = t.from_profile;

  select coalesce(v.price_cents, 0)
       + (case when v.deposit_required then 5000 else 0 end)
       + coalesce((
           select sum(a.price_cents * ra.qty)
           from public.rsvp_addons ra join public.addons a on a.id = ra.addon_id
           where ra.rsvp_id = t.rsvp_id
         ), 0)
    into cap;

  net := least(greatest(net, 0), greatest(cap, 0));

  select member_no into m from public.profiles where id = t.to_profile;
  new_code := 'SYR-' || upper(left(regexp_replace(v.slug,'[^a-zA-Z]','','g'),4))
    || '-' || to_char(v.starts_at,'MMDD') || '-' || right(coalesce(m,'0000'),4);
  update public.rsvps
     set profile_id = t.to_profile, boarding_code = new_code,
         checked_in_at = null, checked_in_by = null, guest_names = '{}', guests = 0
   where id = t.rsvp_id;
  delete from public.rsvp_guests where rsvp_id = t.rsvp_id;
  if net > 0 then
    insert into public.account_ledger (profile_id, delta_cents, kind, memo, voyage_id, rsvp_id)
    values (t.from_profile, net, 'credit', 'Pass handed to a member — ' || v.title, v.id, t.rsvp_id),
           (t.to_profile, -net, 'berth', 'Pass taken over — ' || v.title, v.id, t.rsvp_id);
  end if;
  update public.pass_transfers set status = 'accepted', responded_at = now() where id = p_id;
  insert into public.notifications (profile_id, kind, title, body)
  values (t.from_profile, 'manifest', 'Your pass changed hands.',
          'It is off your manifest and your account is squared.'),
         (t.to_profile, 'manifest', 'A pass is yours: ' || v.title,
          'Your code is ' || new_code || '. Guests are yours to name again.');
end $function$;
