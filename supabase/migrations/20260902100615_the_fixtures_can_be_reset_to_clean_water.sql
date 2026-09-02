/* The fixtures can be reset to clean water (decided 2026-09-02).

   Five personas (e2e-*@fixtures.invalid) share the production project with
   the demo members and the real roll, and every e2e run leaves residue the
   suite cannot sweep: notifications and the ledgers have no DELETE policy,
   the outboxes are read-only to staff, and invites are append-only by grant.
   After a season of runs a fixture card reads a five-figure balance and a
   999-deep inbox, which is not the demo anyone wants to give.

   One definer function, gated on the badge, that knows the order:
     1. fixture sailings — the series that templates them (RESTRICT), the
        passes on them (a sailing inside the credit window with a pass aboard
        refuses to be struck; a cascade would skip the knots reversal), then
        the hulls;
     2. the personas' passes and line places on every other sailing;
     3. threads only fixtures hold, and every word a fixture wrote;
     4. everything that hangs off the personas, table by table;
     5. the by-name residue the suite's sweep already chases;
     6. the outboxes addressed to fixture mailboxes;
     7. the ledgers last, because steps 1–2 write reversal rows into them.
   The personas' profiles, signatures and agreements stay: a fixture that has
   to re-sign the waiver every reset is a fixture the suite cannot rely on.
   Demo members (@demo.*) are never matched — the predicate is the exact
   e2e-*@fixtures.invalid shape, nothing broader.

   A by-name delete whose column or table no longer exists is skipped and
   named in the result rather than failing the reset: the sweep list is a
   record of what the suite has left behind over time, and a table it once
   wrote to may be gone. Everything else fails loud. */
create or replace function public.reset_the_fixtures()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  ids uuid[];
  refs text[];
  vids uuid[];
  n integer;
  counts jsonb := '{}'::jsonb;
  skipped text[] := '{}';
  owned text[][] := array[
    ['charter_options','profile_id'], ['charter_requests','profile_id'],
    ['contest_entries','profile_id'], ['contest_results','profile_id'],
    ['crew_requests','profile_id'], ['voyage_daybeds','profile_id'],
    ['pass_transfers','from_profile'], ['pass_transfers','to_profile'],
    ['installment_plans','profile_id'], ['invoices','profile_id'],
    ['payment_methods','profile_id'], ['subscriptions','profile_id'],
    ['shop_orders','profile_id'], ['galley_orders','profile_id'],
    ['reward_redemptions','profile_id'], ['member_event_proposals','proposer_id'],
    ['member_marks','profile_id'], ['member_qr_tokens','profile_id'],
    ['membership_pauses','profile_id'], ['member_number_releases','profile_id'],
    ['preference_boundaries','profile_id'], ['preference_sheets','profile_id'],
    ['producer_turns','profile_id'], ['push_subscriptions','profile_id'],
    ['table_picks','picker'], ['table_picks','picked'], ['table_seats','profile_id'],
    ['matches','profile_a'], ['matches','profile_b'],
    ['member_blocks','blocker_id'], ['member_blocks','blocked_id'],
    ['vetting_files','profile_id'], ['invites','inviter_id'],
    ['wardroom_comments','author_id'], ['wardroom_flags','flagger_id'],
    ['wardroom_hails','profile_id'], ['wardroom_posts','author_id'],
    ['notifications','profile_id'], ['push_outbox','profile_id']
  ];
  byname text[][] := array[
    ['applications',        $q$email ~ '^e2e-[a-z0-9.-]*@(fixtures\.invalid|example\.com)$'$q$],
    ['crew_candidates',     $q$email like 'e2e-%'$q$],
    ['api_keys',            $q$label like 'E2E%'$q$],
    ['webhooks',            $q$url like '%example.com/e2e%'$q$],
    ['wardroom_flags',      $q$reason = 'E2E'$q$],
    ['wardroom_posts',      $q$body like 'E2E%'$q$],
    ['sponsors',            $q$name like 'E2E%'$q$],
    ['charter_requests',    $q$note = 'E2E'$q$],
    ['member_event_proposals', $q$title like 'E2E%'$q$],
    ['contests',            $q$title like 'E2E%'$q$],
    ['automations',         $q$name like 'E2E%'$q$],
    ['activity_formats',    $q$slug like 'e2e-%'$q$],
    ['subscriptions',       $q$plan_id in (select id from public.membership_plans where label like 'E2E%')$q$],
    ['membership_plans',    $q$label like 'E2E%'$q$],
    ['club_products',       $q$slug like 'e2e-%'$q$],
    ['vessels',             $q$name like 'E2E Charter Hull%'$q$],
    ['elements',            $q$element_id like 'E2E-%'$q$],
    ['dating_tables',       $q$number = 99$q$],
    ['document_versions',   $q$status = 'draft' and version >= 900$q$],
    ['seasons',             $q$title like 'E2E%'$q$],
    ['venues',              $q$name like 'E2E%'$q$],
    ['email_outbox',        $q$to_email ~ '@(fixtures\.invalid|example\.(com|org|net))$'$q$]
  ];
  pair text[];
begin
  if not public.is_staff() then
    raise exception 'the Bridge resets the fixtures';
  end if;

  select coalesce(array_agg(id), '{}'), coalesce(array_agg(member_no), '{}')
    into ids, refs
  from public.profiles
  where email ~ '^e2e-[a-z0-9.-]*@fixtures\.invalid$';
  if coalesce(array_length(ids, 1), 0) = 0 then
    raise exception 'no fixture personas on the roll';
  end if;

  -- 1. fixture sailings
  select coalesce(array_agg(id), '{}') into vids
  from public.voyages where title like 'E2E %' or slug like 'e2e-%';
  delete from public.voyage_series where template_voyage_id = any(vids) or title like 'E2E%';
  get diagnostics n = row_count; counts := counts || jsonb_build_object('voyage_series', n);
  delete from public.waitlist_entries where voyage_id = any(vids);
  delete from public.rsvps where voyage_id = any(vids);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('rsvps_on_fixture_sailings', n);
  delete from public.voyages where id = any(vids);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('voyages', n);

  -- 2. the personas' passes anywhere else
  delete from public.waitlist_entries where profile_id = any(ids);
  delete from public.rsvps where profile_id = any(ids);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('rsvps', n);

  -- 3. threads only fixtures hold, and every word a fixture wrote
  delete from public.threads t
  where t.voyage_id is null
    and exists (select 1 from public.thread_members m where m.thread_id = t.id)
    and not exists (select 1 from public.thread_members m
                    where m.thread_id = t.id and not (m.profile_id = any(ids)));
  get diagnostics n = row_count; counts := counts || jsonb_build_object('threads', n);
  delete from public.messages where author_id = any(ids);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('messages', n);

  -- 4. everything that hangs off the personas
  foreach pair slice 1 in array owned loop
    begin
      execute format('delete from public.%I where %I = any($1)', pair[1], pair[2]) using ids;
      get diagnostics n = row_count;
      if n > 0 then counts := counts || jsonb_build_object(pair[1], coalesce((counts->>pair[1])::int, 0) + n); end if;
    exception when undefined_table or undefined_column then
      skipped := skipped || (pair[1] || '.' || pair[2]);
    end;
  end loop;

  -- 5. the by-name residue
  foreach pair slice 1 in array byname loop
    begin
      execute format('delete from public.%I where %s', pair[1], pair[2]);
      get diagnostics n = row_count;
      if n > 0 then counts := counts || jsonb_build_object(pair[1], coalesce((counts->>pair[1])::int, 0) + n); end if;
    exception when undefined_table or undefined_column then
      skipped := skipped || pair[1];
    end;
  end loop;

  -- 7. the ledgers last: steps 1–2 wrote reversal rows into them
  delete from public.account_ledger where profile_id = any(ids) or member_ref = any(refs);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('account_ledger', n);
  delete from public.fathoms_ledger where profile_id = any(ids) or member_ref = any(refs);
  get diagnostics n = row_count; counts := counts || jsonb_build_object('fathoms_ledger', n);

  -- the personas themselves: only the processor handle, which a test mints
  update public.profiles set stripe_customer_id = null
  where id = any(ids) and (stripe_customer_id like 'cus_e2e_%' or stripe_customer_id like 'cus_probe_%');

  return jsonb_build_object('personas', array_length(ids, 1), 'counts', counts, 'skipped', to_jsonb(skipped));
end $$;

revoke all on function public.reset_the_fixtures() from public, anon;
grant execute on function public.reset_the_fixtures() to authenticated;;
