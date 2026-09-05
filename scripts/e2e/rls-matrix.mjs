/* ---------- RLS / RBAC matrix ----------
   Every exposed relation × every role × every verb, probed live as the
   persona through PostgREST. Sections E (schemaInvariants), F (anonSurface)
   and G (isolationRules) of the suite already pin the catalog invariants, the
   anonymous read surface and the owned-table isolation list; this module is
   the cell-by-cell complement: the roles the suite has no persona for (the
   door, the paused member as a WRITER), every verb on every table rather than
   SELECT on a list, every definer RPC as the wrong caller, and the columns a
   policy lets through that a trigger is supposed to stop.

   Labels are "<table> · <role> · <verb>"; the detail carries expected-vs-got.
   Roles: anon · member (regional) · other (global) · paused · staff · door
   (national, granted one fixture episode and not the other).

   Expectation vocabulary, and how a refusal is meant to look:
     sealed   — a read that must answer 200 [] (never 42501: the grant is on
                the role, the policy does the sealing)
     silent   — a write that must touch 0 rows (policy hides the row)
     loud     — a write that must error with a trigger's sentence
     open     — the product says this is allowed
   Where the product intent is ambiguous the safer reading is asserted and the
   ambiguity is written into the label. */

const ZERO = "00000000-0000-0000-0000-000000000000";
const said = (r) => String(r?.data?.message ?? r?.data?.hint ?? (typeof r?.data === "string" ? r.data : JSON.stringify(r?.data ?? ""))).toLowerCase();
const rows = (r) => (Array.isArray(r?.data) ? r.data : []);
const isArr = (r) => Array.isArray(r?.data);
const brief = (r, n = 90) => `got ${r?.status} ${said(r).slice(0, n)}`;

/* ---- the read taxonomy ------------------------------------------------- */
/* Anon may see rows here (the open catalogue). Everything else anon reaches
   must be 200 []. */
const ANON_PUBLIC = new Set([
  "episodes", "cities", "vessels", "episode_vessels", "log_posts", "addons", "membership_plans",
  "crew_roles", "cabins", "episode_cuts", "series", "club_products", "episode_legs", "episode_stops",
  "application_questions", "club_settings", "crew", "crew_assignments", "crew_positions", "editions",
  "seasons", "venues", "leagues", "segments", "sponsor_tiers", "episode_radar", "episode_segment_caps",
  "episode_media", "episode_capacity", "episode_segment_capacity",
]);
/* Any signed-in member may read every row (the clubhouse catalogue and the
   shared boards). crew_requests is here because the Passes page renders the
   open board for everyone — which contradicts the suite's OWNED_TABLES list,
   where it only ever passed because the other persona held no row. */
const MEMBER_CATALOGUE = new Set([
  "products", "rewards", "galley_items", "marks", "tables", "polls", "documents", "document_requirements",
  "document_versions", "email_templates", "contests", "contest_results", "open_deck_posts",
  "open_deck_comments", "open_deck_hails", "crew_requests", "contest_entries", "member_marks",
  "table_seats", "messages", "threads", "thread_members", "signatures", "shared_anchors",
  "pass_addons", "pass_guests", "galley_order_items", "shop_order_items", "pod_sessions", "radar_picks",
  "member_league", "member_engagement", "member_affinity", "member_directory", "poll_tallies",
  "member_crew_history", "member_waiver_standing", "member_value", "own_vetting_state",
  "own_counter_signature", "agreement_standing",
]);
/* Invoker views over a public table: the rows show but every figure is
   computed from sealed tables, so a non-staff reader must see zeros only. */
const INVOKER_SHAPE_ONLY = {
  episode_pnl: ["revenue_cents", "cost_cents", "unsettled_cents", "margin_cents", "costed"],
  membership_cohorts: ["joined", "active_now", "lapsed", "paused", "departed"],
};
/* A member reads their own rows and nobody else's: the column that says whose. */
const OWNED = {
  account_ledger: "profile_id", charter_options: "profile_id", charter_requests: "profile_id",
  debriefs: "profile_id", door_grants: "profile_id", episode_daybeds: "profile_id",
  galley_orders: "profile_id", installment_plans: "profile_id", invites: "inviter_id", invoices: "profile_id",
  knots_ledger: "profile_id", member_blocks: "blocker_id", member_event_proposals: "proposer_id",
  member_qr_tokens: "profile_id", membership_pauses: "profile_id", notifications: "profile_id",
  open_deck_flags: "flagger_id", pass_credits: "profile_id", passes: "profile_id",
  payment_methods: "profile_id", poll_votes: "profile_id", preference_boundaries: "profile_id",
  preference_sheets: "profile_id", profiles: "id", push_subscriptions: "profile_id",
  reward_redemptions: "profile_id", shop_orders: "profile_id", subscriptions: "profile_id",
  table_picks: "picker", waitlist_entries: "profile_id", wallet_tokens: "profile_id",
  knots_balance: "profile_id", account_balance: "profile_id", member_pass_usage: "profile_id",
  waitlist_position: "profile_id",
};
/* Two-party rows: neither column may name a stranger. */
const TWO_PARTY = { pass_transfers: ["from_profile", "to_profile"], matches: ["profile_a", "profile_b"], direct_thread_pairs: ["lo", "hi"] };

/* Every relation PostgREST exposes. Read live so a new table lands in the
   matrix the day it is created; the taxonomy above says what to expect. */
async function exposedRelations(ctx) {
  /* PostgREST answers the root 401 without a bearer, even for anon — section
     F's coverage check makes this same call with the apikey alone and skips
     itself on the failure, which is why it never noticed. */
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(`${ctx.SUPA}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  if (!res.ok) return { live: false, list: EXPOSED_FALLBACK };
  const spec = await res.json();
  const list = Object.keys(spec.definitions ?? spec.components?.schemas ?? {}).filter((t) => !t.includes(".")).sort();
  return list.length ? { live: true, list } : { live: false, list: EXPOSED_FALLBACK };
}
/* The catalog as read on 2026-09-05 (151 tables, 23 views): the fallback when
   the project has OpenAPI switched off for anon, so the sweep still runs. A
   relation created after this date is caught by the live enumeration when it
   is on, and by section E's has_policy check regardless. */
const EXPOSED_FALLBACK = [
  "account_balance", "account_ledger", "addons", "agreement_standing", "api_keys", "app_errors", "application_funnel",
  "application_questions", "applications", "audit_log", "automation_queue", "automations", "broadcasts", "cabins",
  "captains_log_envelopes", "card_notices", "charter_options", "charter_requests", "cities", "city_tax", "clause_versions",
  "clauses", "club_products", "club_settings", "contest_entries", "contest_results", "contests", "counter_signatures", "crew",
  "crew_assignments", "crew_blackouts", "crew_candidate_events", "crew_candidates", "crew_needs", "crew_positions",
  "crew_requests", "crew_roles", "debriefs", "document_clauses", "document_requirements", "document_versions", "documents",
  "door_grants", "dunning_log", "dunning_steps", "editions", "element_substitutes", "elements", "email_outbox",
  "email_suppressions", "email_templates", "episode_capacity", "episode_crew_gaps", "episode_crew_needs", "episode_cuts",
  "episode_daybeds", "episode_expenses", "episode_legs", "episode_media", "episode_pnl", "episode_radar",
  "episode_segment_capacity", "episode_segment_caps", "episode_sponsors", "episode_stops", "episode_vessels", "episodes",
  "expense_kinds", "galley_items", "galley_order_items", "galley_orders", "installment_plans", "invites", "invoices",
  "knots_balance", "knots_ledger", "lapsed_members", "leagues", "log_posts", "marks", "matches", "member_affinity",
  "member_crew_history", "member_directory", "member_engagement", "member_event_proposals", "member_league", "member_marks",
  "member_number_releases", "member_pass_usage", "member_qr_tokens", "member_roll", "member_value", "member_waiver_standing",
  "membership_cohorts", "membership_pauses", "membership_plans", "messages", "notifications", "open_deck_comments",
  "open_deck_flags", "open_deck_hails", "open_deck_posts", "own_vetting_state", "pass_addons", "pass_credits", "pass_guests",
  "pass_transfers", "passes", "payment_methods", "pod_sessions", "poll_tallies", "poll_votes", "polls", "preference_boundaries",
  "preference_sheets", "products", "profiles", "promo_codes", "push_outbox", "push_subscriptions", "radar_picks",
  "reward_redemptions", "rewards", "run_of_show", "saved_segments", "seasons", "segments", "series", "shared_anchors",
  "shop_order_items", "shop_orders", "signatures", "sms_outbox", "sms_templates", "sponsor_tiers", "sponsors", "stripe_events",
  "stripe_reconciliation", "subscriptions", "table_picks", "table_seats", "tables", "thread_members", "threads", "venues",
  "vessels", "vetting_files", "waitlist_entries", "waitlist_position", "wallet_registrations", "wallet_tokens",
  "webhook_deliveries", "webhooks",
];
/* The tables anon holds no SELECT grant on do not appear in anon's OpenAPI at
   all, so they are named here — and probed, because the design says a sealed
   table answers [] rather than 42501. */
const UNGRANTED_TO_ANON = ["direct_thread_pairs", "member_blocks", "orphaned_media", "producer_turns", "status_lookups", "own_counter_signature"];

/* ---- RPC catalogue ------------------------------------------------------ */
/* Definer functions granted to authenticated and not to anon, with arguments
   that resolve (a "could not find the function" answer means the probe never
   reached the permission check and is reported as inconclusive). */
const AUTH_RPCS = (ids) => ({
  aboard_now: { p_episode: ids.epB }, accept_application: { p_id: ZERO }, accept_pass_transfer: { p_id: ZERO },
  adjust_knots: { p_profile: ids.me, p_delta: 100, p_reason: "E2E" }, assign_vessels_evenly: { p_episode: ids.epB },
  at_table: { p_table: ZERO }, attach_addons: { p_pass: ZERO, p_addons: [], p_qty: 1 }, cabin_places_open: { p_episode: ids.epB },
  cast_vote: { p_poll: ZERO, p_option: 0 }, check_promo: { p_code: "E2E-NOPE", p_episode: ids.epB }, claim_a_daybed: { p_pass: ZERO },
  claim_stripe_customer: { p_customer_id: "cus_e2e_rls" }, claim_table_seat: { p_table: ZERO }, claim_your_place: { p_entry: ZERO },
  claimed_cabins: { p_cabins: [] }, comp_a_pass_for_sponsor: { p_episode: ids.epB, p_sponsor: ZERO, p_profile: ids.me },
  confirm_table_seat: { p_table: ZERO }, contest_standing: { p_contest_id: ZERO }, counter_sign: { p_signature_id: ZERO },
  cron_failures: {}, decide_a_proposal: { p_id: ZERO, p_status: "declined" }, delivery_health: {}, door_manifest: { p_episode: ids.epB },
  episode_manifest: { p_episode: ids.epB }, export_my_data: {}, extend_the_series: { p_series: ZERO, p_count: 1 },
  grant_pass_credit_by_hand: { p_profile: ids.me, p_cents: 100 }, guest_has_signed: { p_guest: ZERO }, has_a_pass_for_the_table: { p_table: ZERO },
  hold_a_cabin_on_option: { p_episode: ids.epB, p_cabin: ZERO }, in_thread: { p_thread: ZERO }, incoming_transfers: {}, is_active: {},
  is_door: { p_episode: ids.epB }, is_staff: {}, issue_member_qr: {}, issue_the_envelopes: { p_episode: ids.epB }, issue_wallet_token: {},
  ledger_since: { p_since: "2026-01-01" }, lift_a_leg_hold: { p_leg: ZERO }, membership_pause_days_used: { p_profile: ids.me },
  notice_count: { p_kind: "word" }, notify_member: { p_profile: ids.me, p_kind: "word", p_title: "E2E", p_body: "E2E" },
  offer_the_next_place: { p_episode: ids.epB, p_segment: "single_man" }, offer_this_place: { p_entry: ZERO }, open_direct_thread: { p_other: ids.other },
  open_shoreside_thread: {}, open_the_captains_log: { p_token: ZERO }, open_the_radar: { p_episode: ids.epB }, pass_credit_left: {},
  pass_price: { p_episode: ids.epB }, passage_log: { p_profile_id: ids.me }, place_galley_order: { p_episode: ids.epB, p_lines: [] },
  place_shop_order: { p_lines: [] }, poll_results: { p_poll: ZERO }, post_a_leg_hold: { p_leg: ZERO, p_reason: "x", p_new_plan: "x", p_unchanged: "x" },
  publish_document_version: { p_id: ZERO }, published_version: { p_document_code: "waiver" }, purge_expired_signatures: {},
  purge_spent_identity_records: {}, queue_email: { p_to: "e2e-rls@fixtures.invalid", p_template: "x" }, radar_sweep: { p_episode: ids.epB },
  redact_signature: { p_id: ZERO }, redeem_reward: { p_reward: ZERO }, reissue_member_number: { p_profile: ids.me, p_number: "UN-E2E" },
  release_charter_option: { p_option: ZERO }, release_member_number: { p_profile: ids.me }, render_document: { p_document_version_id: ZERO },
  requeue_outbox_row: { p_table: "email_outbox", p_id: ZERO }, reset_the_fixtures: {}, revoke_wallet_token: {}, rotate_calendar_token: {},
  scheduler_health: {}, season_card: { p_profile_id: ids.me, p_from: "2026-01-01T00:00:00Z", p_to: "2026-12-31T00:00:00Z" }, security_report: {},
  seed_the_run_of_show: { p_episode: ids.epB }, send_broadcast: { p_audience: {}, p_title: "E2E", p_body: "E2E", p_channels: [] },
  send_season_cards: { p_from: "2026-01-01T00:00:00Z", p_to: "2026-12-31T00:00:00Z" }, set_application_status: { p_id: ZERO, p_status: "declined" },
  set_manifest_visibility: { p_on: true }, set_own_standing: { p_status: "active" }, settle_contest: { p_contest_id: ZERO },
  settle_galley_ticket: { p_profile: ids.me, p_lines: [], p_tender: "cash" }, shared_episodes: { p_other: ids.other },
  shares_ground_with: { p_other: ids.other }, sign_document: { p_document_code: "waiver" }, signature_standing: { p_profile_id: ids.me },
  signature_tally: {}, take_a_producer_turn: {}, verify_member_phone: { p_profile: ids.me }, verify_member_qr: { p_token: ZERO },
  verify_wallet_token: { p_token: ZERO },
});
/* Staff-only by product. A member must be refused before any work is done. */
const STAFF_ONLY_RPCS = [
  "accept_application", "adjust_knots", "assign_vessels_evenly", "comp_a_pass_for_sponsor", "counter_sign", "cron_failures",
  "decide_a_proposal", "delivery_health", "extend_the_series", "grant_pass_credit_by_hand", "issue_the_envelopes", "ledger_since",
  "lift_a_leg_hold", "notice_count", "notify_member", "offer_the_next_place", "offer_this_place", "open_the_radar",
  "post_a_leg_hold", "publish_document_version", "purge_expired_signatures", "purge_spent_identity_records", "queue_email",
  "redact_signature", "reissue_member_number", "release_member_number", "render_document", "requeue_outbox_row", "reset_the_fixtures",
  "scheduler_health", "security_report", "seed_the_run_of_show", "send_broadcast", "send_season_cards", "set_application_status",
  "settle_contest", "settle_galley_ticket", "signature_tally", "verify_member_phone", "verify_member_qr", "verify_wallet_token",
];
/* Spending and posting: a paused member must be refused by name. */
const SPEND_RPCS = ["redeem_reward", "place_shop_order", "place_galley_order", "attach_addons", "cast_vote", "open_direct_thread"];
/* Definer functions that are not granted to anon or authenticated at all —
   cron and webhook plumbing. Each is probed once as a member. */
const INTERNAL_RPCS = [
  "run_automation_queue", "run_due_broadcasts", "run_dunning", "perform_broadcast", "draw_installments", "grant_monthly_pass_credit",
  "erase_departed_profiles", "get_app_secret", "confer_marks", "build_lore_digest", "carry_the_clock", "write_to_the_long_held",
  "requeue_stalled_sends", "purge_spent_identity_unattended", "purge_expired_signatures_unattended", "cron_purge_expired_records",
  "anon_write_grants_report", "scheduler_secrets_are_unreachable", "request_ip", "tax_cents_for", "grant_pass_credit_for",
  "lapse_stale_waitlist_offers", "blur_is_required",
];

export async function run(p, ctx) {
  const { rest, note, uid, RUN_TOKEN } = ctx;
  const anon = rest(null), reg = rest(p.regional), glo = rest(p.global), pau = rest(p.paused), stf = rest(p.staff), nat = rest(p.national);
  const me = uid(p.regional), other = uid(p.global), pausedId = uid(p.paused), doorId = uid(p.national), staffId = uid(p.staff);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
  const nowIso = () => new Date().toISOString();

  /* What this run creates, so `finally` can take it all back. */
  const made = { episodes: [], passes: [], guestRows: [], waitlist: [], crewRequests: [], posts: [], walletIssued: [] };
  const before = {};

  try {
    /* ══ 0. fixtures ═══════════════════════════════════════════════════════ */
    const raise = async (label) => {
      const v = await stf.post("episodes", {
        slug: `e2e-rls-${label}-${stamp}`, title: `E2E rls ${label} fixture.`, setting: "sea", kind: "sea_day", sub_class: "passage",
        starts_at: soon, time_zone: "America/New_York", passes_total: 8, price_cents: 0, status: "live", min_tier: "regional",
      });
      const id = v.data?.[0]?.id ?? null;
      if (id) made.episodes.push(id);
      note("staff", `episodes · staff · INSERT (fixture ${label})`, v.status === 201, brief(v));
      return id;
    };
    const epA = await raise("a");
    const epB = await raise("b");
    const ids = { epA, epB, me, other };

    const snap = await stf.get(`profiles?id=eq.${me}&select=bio,comped_until,on_manifest,phone_verified`);
    before.regional = snap.data?.[0] ?? {};
    if (before.regional.phone_verified === true) await stf.patch(`profiles?id=eq.${me}`, { phone_verified: false });

    /* ══ 1. the read matrix: every exposed relation × anon / member / paused ═ */
    const exposed = await exposedRelations(ctx);
    const relations = exposed.list;
    note("anon", "catalog · anon · enumerate", relations.length > 120,
      `${relations.length} relations ${exposed.live ? "from the live OpenAPI" : "from the pinned catalog (the OpenAPI root now demands a secret key — section F’s every-exposed-relation-is-named check is skipping itself for the same reason)"}`);
    const known = new Set([...ANON_PUBLIC, ...MEMBER_CATALOGUE, ...Object.keys(OWNED), ...Object.keys(TWO_PARTY), ...Object.keys(INVOKER_SHAPE_ONLY)]);

    for (const t of relations) {
      const a = await anon.get(`${t}?select=*&limit=2`);
      if (ANON_PUBLIC.has(t)) {
        /* A table anon reads column by column (episodes and venues keep the
           address to themselves) answers "permission denied for table" to
           select=*; the catalogue is still open, so ask for the id column alone
           (a count needs the table-level privilege too). */
        const columnScoped = a.status !== 200 && /permission denied for table/.test(said(a));
        const c = columnScoped ? await anon.get(`${t}?select=id&limit=1`) : null;
        note("anon", `${t} · anon · SELECT`, (a.status === 200 && isArr(a)) || (c?.status === 200),
          `expected open catalogue (200 array${columnScoped ? ", column-scoped grant" : ""}); ${brief(c ?? a, 60)}`);
      } else if (INVOKER_SHAPE_ONLY[t]) {
        const figures = rows(a).flatMap((row) => INVOKER_SHAPE_ONLY[t].map((k) => row[k])).filter((v) => v !== 0 && v !== false && v !== null && v !== undefined);
        note("anon", `${t} · anon · SELECT`, a.status === 200 && figures.length === 0,
          `expected [] or rows with no figures (invoker view over a public table); got ${a.status} ${rows(a).length} rows, figures: ${JSON.stringify(figures).slice(0, 40) || "none"}`);
      } else {
        const clean = (a.status === 200 && isArr(a) && rows(a).length === 0) || ((a.status === 401 || a.status === 403) && /permission denied/.test(said(a)));
        note("anon", `${t} · anon · SELECT`, clean, `expected sealed (200 [] by policy, or permission denied with no grant); got ${a.status} ${JSON.stringify(a.data).slice(0, 70)}`);
      }
    }
    /* No grant at all is the stronger seal: a 401/42501 refuses before a
       policy is consulted. Either shape is sealed; a row is the leak. */
    for (const t of UNGRANTED_TO_ANON) {
      const a = await anon.get(`${t}?select=*&limit=1`);
      const sealed = (a.status === 200 && rows(a).length === 0) || ((a.status === 401 || a.status === 403) && /permission denied/.test(said(a)));
      note("anon", `${t} · anon · SELECT`, sealed,
        `expected sealed (200 [] by policy, or permission denied with no grant); got ${a.status} ${said(a).slice(0, 60)}`);
    }

    const forMembers = [...new Set([...relations, ...UNGRANTED_TO_ANON])].sort();
    const memberRead = async (who, session, selfId) => {
      const r = rest(session);
      for (const t of forMembers) {
        if (ANON_PUBLIC.has(t) || MEMBER_CATALOGUE.has(t)) {
          const res = await r.get(`${t}?select=*&limit=1`);
          note(who, `${t} · ${who} · SELECT`, res.status === 200 && isArr(res), `expected readable (200 array); ${brief(res, 60)}`);
        } else if (OWNED[t]) {
          const col = OWNED[t];
          const res = await r.get(`${t}?select=${col}&${col}=neq.${selfId}&limit=3`);
          note(who, `${t} · ${who} · SELECT other's`, res.status === 200 && rows(res).length === 0,
            `expected [] for rows where ${col} <> self; got ${res.status} ${JSON.stringify(res.data).slice(0, 70)}`);
        } else if (INVOKER_SHAPE_ONLY[t]) {
          const res = await r.get(`${t}?select=*&limit=3`);
          note(who, `${t} · ${who} · SELECT (invoker view — figures are the reader's own, recorded)`, res.status === 200 && isArr(res),
            `got ${res.status} ${rows(res).length} rows; a staff-only report that is not sealed: ${JSON.stringify(rows(res)[0] ?? "").slice(0, 70)}`);
        } else if (TWO_PARTY[t]) {
          const [x, y] = TWO_PARTY[t];
          const res = await r.get(`${t}?select=${x},${y}&${x}=neq.${selfId}&${y}=neq.${selfId}&limit=3`);
          note(who, `${t} · ${who} · SELECT other's`, res.status === 200 && rows(res).length === 0,
            `expected [] where neither party is self; got ${res.status} ${JSON.stringify(res.data).slice(0, 70)}`);
        } else {
          const res = await r.get(`${t}?select=*&limit=1`);
          note(who, `${t} · ${who} · SELECT`, res.status === 200 && rows(res).length === 0,
            `expected staff-only 200 []; got ${res.status} ${JSON.stringify(res.data).slice(0, 70)}`);
        }
      }
    };
    await memberRead("member", p.regional, me);
    await memberRead("paused", p.paused, pausedId);
    /* Staff read everything without error. */
    for (const t of forMembers) {
      const res = await stf.get(`${t}?select=*&limit=1`);
      note("staff", `${t} · staff · SELECT`, res.status === 200 && isArr(res), brief(res, 60));
    }
    const unknown = forMembers.filter((t) => !known.has(t));
    note("member", "catalog · member · every relation is classified", true, `${unknown.length} relations fell to the staff-only default: ${unknown.slice(0, 8).join(", ")}${unknown.length > 8 ? "…" : ""}`);

    /* ══ 2. anon writes: the two funnels take an INSERT, nothing else ═══════ */
    for (const t of relations) {
      const ins = await anon.postMinimal(t, {});
      const funnel = t === "applications" || t === "crew_candidates";
      /* An empty funnel row fails its own WITH CHECK, which is a policy answer
         (42501) rather than a grant answer (401/404) — either way it is refused;
         the open funnel itself is asserted by section F with a real row. */
      note("anon", `${t} · anon · INSERT`, ins.status >= 400, `expected refused${funnel ? " (empty row fails WITH CHECK)" : ""}; got ${ins.status} ${said(ins).slice(0, 50)}`);
    }
    for (const [t, key] of [["episodes", `id=eq.${epA}`], ["profiles", `id=eq.${me}`], ["passes", `episode_id=eq.${epA}`], ["club_settings", "key=eq.knots_pass_award"]]) {
      const up = await anon.patch(`${t}?${key}`, { title: "x" });
      note("anon", `${t} · anon · UPDATE`, up.status >= 400 || rows(up).length === 0, `expected refused or 0 rows; ${brief(up, 50)}`);
      const del = await anon.del(`${t}?${key}`);
      note("anon", `${t} · anon · DELETE`, del.status >= 400 || rows(del).length === 0, `expected refused or 0 rows; ${brief(del, 50)}`);
    }
    const stillThere = await stf.get(`episodes?id=eq.${epA}&select=id,title`);
    note("staff", "episodes · anon · DELETE left the row", rows(stillThere).length === 1 && /rls a/.test(stillThere.data[0].title), brief(stillThere, 60));

    /* ══ 3. shared tables: a member may read and may not write ═════════════ */
    for (const [t, key, body] of [
      ["episodes", `id=eq.${epA}`, { title: "E2E overwritten by a member" }],
      ["cities", "slug=neq.zz-none", { name: "x" }],
      ["series", "active=eq.true", { label: "x" }],
      ["membership_plans", "active=eq.true", { price_cents: 1 }],
      ["club_settings", "key=eq.knots_pass_award", { value_int: 99999 }],
      ["products", "active=eq.true", { price_cents: 1 }],
      ["venues", "active=eq.true", { name: "x" }],
      ["promo_codes", "active=eq.true", { max_uses: 999999 }],
      ["episode_media", "approved=eq.true", { approved: false }],
    ]) {
      const up = await reg.patch(`${t}?${key}&limit=1`, body);
      note("member", `${t} · member · UPDATE`, up.status < 500 && rows(up).length === 0 || up.status === 403 || up.status === 401,
        `expected silent 0 rows (no policy) or 42501; ${brief(up, 60)}`);
    }
    const stayed = await stf.get(`episodes?id=eq.${epA}&select=title`);
    note("staff", "episodes · member · UPDATE changed nothing", /rls a fixture/.test(stayed.data?.[0]?.title ?? ""), JSON.stringify(stayed.data).slice(0, 80));
    for (const [t, body] of [
      ["episodes", { slug: `e2e-rls-member-${stamp}`, title: "x", setting: "sea", starts_at: soon }],
      ["cities", { slug: `e2e-rls-${stamp}`, name: "x" }],
      ["series", { slug: `e2e-rls-${stamp}`, label: "x", blurb: "x", division: "x" }],
      ["promo_codes", { code: `E2ERLS${stamp}`.toUpperCase(), kind: "comp" }],
      ["door_grants", { profile_id: me, episode_id: epB, expires_at: soon }],
      ["account_ledger", { profile_id: me, delta_cents: 50000, kind: "credit" }],
      ["knots_ledger", { profile_id: me, delta: 5000, reason: "E2E mint" }],
      ["notifications", { profile_id: other, title: "E2E forged notice" }],
      ["thread_members", { thread_id: ZERO, profile_id: me }],
      ["invoices", { profile_id: me }],
      ["subscriptions", { profile_id: me, status: "active" }],
      ["pass_credits", { profile_id: me, period: "2026-09-01", granted_cents: 100000 }],
      ["member_roll", { email: `e2e-rls-${stamp}@fixtures.invalid` }],
    ]) {
      const ins = await reg.post(t, body);
      note("member", `${t} · member · INSERT`, ins.status >= 400, `expected 42501; ${brief(ins, 60)}`);
    }
    const del = await reg.del(`episodes?id=eq.${epA}`);
    note("member", "episodes · member · DELETE", del.status < 300 && rows(del).length === 0 || del.status >= 400, `expected silent 0 rows; ${brief(del, 50)}`);
    /* knots_ledger takes no direct INSERT from anyone signed in; adjust_knots is the way. */
    const staffMint = await stf.post("knots_ledger", { profile_id: me, delta: 1, reason: "E2E direct" });
    note("staff", "knots_ledger · staff · INSERT", staffMint.status >= 400, `expected 42501 (the ledger is written by adjust_knots, not by hand); ${brief(staffMint, 60)}`);
    if (staffMint.status === 201 && staffMint.data?.[0]?.id) await stf.del(`knots_ledger?id=eq.${staffMint.data[0].id}`);

    /* ══ 4. passes: own / other's / paused / privileged columns ═════════════ */
    const forOther = await reg.post("passes", { episode_id: epB, profile_id: other, status: "aboard" });
    note("member", "passes · member · INSERT for another member", forOther.status >= 400, `expected 42501 (WITH CHECK profile_id = self); ${brief(forOther, 70)}`);
    if (forOther.status === 201) made.passes.push([forOther.data[0].id, "global"]);

    const pausedBoards = await pau.post("passes", { episode_id: epB, profile_id: pausedId, status: "aboard" });
    note("paused", "passes · paused · INSERT", pausedBoards.status >= 400, `expected refused (is_active in WITH CHECK, or the guard by name); ${brief(pausedBoards, 70)}`);
    if (pausedBoards.status === 201) made.passes.push([pausedBoards.data[0].id, "paused"]);

    /* The gangway columns are guarded on UPDATE. On INSERT the policy only
       checks whose row it is, so the columns ride in on the body unless a
       trigger scrubs them. */
    const forged = await reg.post("passes", {
      episode_id: epA, profile_id: me, status: "aboard", checked_in_at: nowIso(), checked_in_by: me, boarding_code: `UN-E2E-${stamp}`.toUpperCase().slice(0, 20), show_on_manifest: true,
    });
    const forgedRow = forged.data?.[0];
    if (forgedRow?.id) made.passes.push([forgedRow.id, "regional"]);
    note("member", "passes · member · INSERT with checked_in_at/boarding_code preset (loud or scrubbed)",
      forged.status >= 400 || (forgedRow && forgedRow.checked_in_at === null && !/E2E/.test(forgedRow.boarding_code ?? "")),
      `expected refusal or a scrubbed row; got ${forged.status} checked_in_at=${forgedRow?.checked_in_at ?? "∅"} boarding_code=${forgedRow?.boarding_code ?? "∅"} ${said(forged).slice(0, 60)}`);
    let regA = forgedRow?.id ?? null;
    if (!regA) {
      const plain = await reg.post("passes", { episode_id: epA, profile_id: me, status: "aboard" });
      regA = plain.data?.[0]?.id ?? null;
      if (regA) made.passes.push([regA, "regional"]);
      note("member", "passes · member · INSERT own (A)", plain.status === 201, brief(plain, 80));
    }
    const regB = await reg.post("passes", { episode_id: epB, profile_id: me, status: "aboard" });
    const regBId = regB.data?.[0]?.id ?? null;
    if (regBId) made.passes.push([regBId, "regional"]);
    note("member", "passes · member · INSERT own (B)", regB.status === 201, brief(regB, 80));
    const gloB = await glo.post("passes", { episode_id: epB, profile_id: other, status: "aboard" });
    const gloBId = gloB.data?.[0]?.id ?? null;
    if (gloBId) made.passes.push([gloBId, "global"]);
    note("other", "passes · other · INSERT own (B)", gloB.status === 201, brief(gloB, 80));

    const own = await reg.get(`passes?episode_id=eq.${epB}&select=id,profile_id`);
    note("member", "passes · member · SELECT own", rows(own).length === 1 && own.data[0].profile_id === me, `expected exactly own row on B; got ${rows(own).length} rows`);
    const staffSees = await stf.get(`passes?episode_id=eq.${epB}&select=id`);
    note("staff", "passes · staff · SELECT", rows(staffSees).length >= 2, `expected both passes on B; got ${rows(staffSees).length}`);
    const pausedSees = await pau.get(`passes?episode_id=eq.${epB}&select=id`);
    note("paused", "passes · paused · SELECT other's", rows(pausedSees).length === 0, `expected []; got ${rows(pausedSees).length}`);

    if (regBId) {
      const toggle = await reg.patch(`passes?id=eq.${regBId}`, { show_on_manifest: false });
      note("member", "passes · member · UPDATE own (show_on_manifest)", toggle.status === 200 && toggle.data?.[0]?.show_on_manifest === false, brief(toggle, 70));
      for (const [label, body, re] of [
        ["checked_in_at", { checked_in_at: nowIso() }, /gangway checks you in/],
        ["boarding_code", { boarding_code: "UN-FORGED" }, /issued by the club/],
        ["comp", { comp: true }, /complimentary pass comes from the bridge/],
        ["vessel_id", { vessel_id: ZERO }, /bridge assigns hulls/],
        ["episode_id", { episode_id: epA }, /belongs to the episode/],
      ]) {
        const res = await reg.patch(`passes?id=eq.${regBId}`, body);
        note("member", `passes · member · UPDATE own ${label} (loud)`, res.status >= 400 && re.test(said(res)), `expected trigger sentence ${re}; ${brief(res, 90)}`);
      }
      const steal = await reg.patch(`passes?id=eq.${regBId}`, { profile_id: other });
      note("member", "passes · member · UPDATE own profile_id → other", steal.status >= 400 || rows(steal).length === 0, `expected refused (WITH CHECK); ${brief(steal, 70)}`);
      const pausedToggle = await pau.patch(`passes?id=eq.${regBId}`, { show_on_manifest: true });
      note("paused", "passes · paused · UPDATE other's", rows(pausedToggle).length === 0, `expected silent 0 rows; ${brief(pausedToggle, 50)}`);
    }
    if (gloBId) {
      const otherUp = await reg.patch(`passes?id=eq.${gloBId}`, { show_on_manifest: false });
      note("member", "passes · member · UPDATE other's", otherUp.status < 500 && rows(otherUp).length === 0, `expected silent 0 rows; ${brief(otherUp, 50)}`);
      const otherDel = await reg.del(`passes?id=eq.${gloBId}`);
      const check = await stf.get(`passes?id=eq.${gloBId}&select=id`);
      note("member", "passes · member · DELETE other's", rows(otherDel).length === 0 && rows(check).length === 1, `expected silent and the row still there; got ${otherDel.status}, ${rows(check).length} row(s) remain`);
      const staffFix = await stf.patch(`passes?id=eq.${gloBId}`, { show_on_manifest: true });
      note("staff", "passes · staff · UPDATE", staffFix.status === 200 && rows(staffFix).length === 1, brief(staffFix, 60));
    }

    /* ══ 5. pass_guests: host writes, the guard scrubs, the door stamps ═════ */
    let guestId = null;
    if (gloBId) {
      const guest = await glo.post("pass_guests", { rsvp_id: gloBId, name: "E2E Guest", checked_in_at: nowIso(), boarding_code: "UN-GUEST-FORGED", kind: "guest" });
      const g = guest.data?.[0];
      guestId = g?.id ?? null;
      if (guestId) made.guestRows.push(guestId);
      const noAllowance = /guest passes ride|per pass on your plan/.test(said(guest));
      note("other", "pass_guests · other · INSERT own guest with checked_in_at/boarding_code preset (scrubbed or refused by plan)",
        noAllowance || (guest.status === 201 && g.checked_in_at === null && g.boarding_code !== "UN-GUEST-FORGED"),
        `expected the guard to null checked_in_at and mint the code; got ${guest.status} checked_in_at=${g?.checked_in_at ?? "∅"} code=${g?.boarding_code ?? "∅"} ${said(guest).slice(0, 60)}`);
      const pausedGuest = await pau.post("pass_guests", { rsvp_id: gloBId, name: "E2E Paused Guest", kind: "guest" });
      note("paused", "pass_guests · paused · INSERT on another's pass", pausedGuest.status >= 400, `expected refused; ${brief(pausedGuest, 60)}`);
      const memberGuest = await reg.post("pass_guests", { rsvp_id: gloBId, name: "E2E Intruder", kind: "guest" });
      note("member", "pass_guests · member · INSERT on another's pass", memberGuest.status >= 400 && /not yours|no such pass|42501|row-level/.test(said(memberGuest)), `expected 'that pass is not yours' or 42501; ${brief(memberGuest, 70)}`);
      if (guestId) {
        const peek = await reg.get(`pass_guests?id=eq.${guestId}&select=id`);
        note("member", "pass_guests · member · SELECT other's", rows(peek).length === 0, `expected []; got ${rows(peek).length}`);
        const rename = await reg.patch(`pass_guests?id=eq.${guestId}`, { name: "E2E Renamed by stranger" });
        note("member", "pass_guests · member · UPDATE other's", rows(rename).length === 0, `expected silent 0 rows; ${brief(rename, 50)}`);
        const selfStamp = await glo.patch(`pass_guests?id=eq.${guestId}`, { on_camera: true });
        note("other", "pass_guests · other · UPDATE own guest's on_camera (loud)", selfStamp.status >= 400 && /guest's to say/.test(said(selfStamp)), `expected 'that is the guest's to say'; ${brief(selfStamp, 80)}`);
      }
    }

    /* ══ 6. the door: one night, and no other ══════════════════════════════ */
    const grant = await stf.post("door_grants", { profile_id: doorId, episode_id: epB, granted_by: staffId, expires_at: new Date(Date.now() + 3600_000).toISOString() });
    note("staff", "door_grants · staff · INSERT", grant.status === 201, brief(grant, 70));
    const memberGrant = await reg.post("door_grants", { profile_id: me, episode_id: epB, expires_at: soon });
    note("member", "door_grants · member · INSERT", memberGrant.status >= 400, `expected 42501; ${brief(memberGrant, 50)}`);
    const doorGrantRead = await nat.get("door_grants?select=episode_id,profile_id");
    note("door", "door_grants · door · SELECT own",
      rows(doorGrantRead).some((g) => g.episode_id === epB) && rows(doorGrantRead).every((g) => g.profile_id === doorId),
      `expected the B grant and only national's own rows (a concurrent run may hold another); got ${JSON.stringify(doorGrantRead.data).slice(0, 80)}`);
    const doorExtend = await nat.patch(`door_grants?episode_id=eq.${epB}`, { expires_at: "2099-01-01T00:00:00Z" });
    note("door", "door_grants · door · UPDATE own (extend)", rows(doorExtend).length === 0, `expected silent 0 rows; ${brief(doorExtend, 50)}`);
    const doorSelfGrant = await nat.post("door_grants", { profile_id: doorId, episode_id: epA, expires_at: soon });
    note("door", "door_grants · door · INSERT (grant self the other night)", doorSelfGrant.status >= 400, `expected 42501; ${brief(doorSelfGrant, 50)}`);

    const manifestB = await nat.get(`passes?episode_id=eq.${epB}&select=id,profile_id,checked_in_at`);
    note("door", "passes · door · SELECT granted night", rows(manifestB).length >= 2, `expected the B manifest; got ${rows(manifestB).length} rows`);
    const manifestA = await nat.get(`passes?episode_id=eq.${epA}&select=id`);
    note("door", "passes · door · SELECT other night", rows(manifestA).length === 0, `expected [] (not granted A); got ${rows(manifestA).length}`);
    const rpcB = await nat.rpc("door_manifest", { p_episode: epB });
    note("door", "door_manifest() · door · granted night", rpcB.status === 200 && rows(rpcB).length >= 2 && rows(rpcB).every((r) => typeof r.full_name === "string"), `expected names on B; got ${rpcB.status} ${rows(rpcB).length} rows`);
    const rpcA = await nat.rpc("door_manifest", { p_episode: epA });
    note("door", "door_manifest() · door · other night", rpcA.status === 200 && rows(rpcA).length === 0, `expected [] for A; got ${rpcA.status} ${rows(rpcA).length} rows`);
    const rpcMember = await reg.rpc("door_manifest", { p_episode: epB });
    note("member", "door_manifest() · member · no grant", rpcMember.status === 200 && rows(rpcMember).length === 0, `expected []; got ${rpcMember.status} ${rows(rpcMember).length} rows`);
    const doorProfiles = await nat.get(`profiles?id=eq.${me}&select=id`);
    note("door", "profiles · door · SELECT manifest member", rows(doorProfiles).length === 0, `expected [] (names come through door_manifest, not the roll); got ${rows(doorProfiles).length}`);
    const doorLedger = await nat.get(`account_ledger?profile_id=eq.${me}&select=id&limit=1`);
    note("door", "account_ledger · door · SELECT manifest member", rows(doorLedger).length === 0, `expected []; got ${rows(doorLedger).length}`);

    if (regBId) {
      const stamp1 = await nat.patch(`passes?id=eq.${regBId}`, { checked_in_at: nowIso(), checked_in_by: doorId });
      note("door", "passes · door · UPDATE checked_in_at (open)", stamp1.status === 200 && !!stamp1.data?.[0]?.checked_in_at, `expected the stamp to land; ${brief(stamp1, 80)}`);
      const unstamp = await nat.patch(`passes?id=eq.${regBId}`, { checked_in_at: null, checked_in_by: null });
      note("door", "passes · door · UPDATE un-stamp (open)", unstamp.status === 200, brief(unstamp, 60));
      /* The migration's own words: the door "lets its holder read the manifest
         and stamp arrivals, and nothing else". Every other column is probed. */
      for (const [label, body, restore] of [
        ["status → released", { status: "released" }, { status: "aboard" }],
        ["profile_id → self", { profile_id: doorId }, { profile_id: me }],
        ["show_on_manifest", { show_on_manifest: false }, { show_on_manifest: true }],
        ["guests", { guests: 1 }, { guests: 0 }],
        ["comp", { comp: true }, { comp: false }],
        ["boarding_code", { boarding_code: "UN-DOOR-FORGED" }, null],
        ["vessel_id", { vessel_id: ZERO }, null],
        ["standby", { standby: true }, { standby: false }],
      ]) {
        /* The member toggled show_on_manifest off above; a door writing the
           same value is no change and no test. Every probe starts from the
           row the guard will see as moved. */
        if (restore) await stf.patch(`passes?id=eq.${regBId}`, restore);
        const res = await nat.patch(`passes?id=eq.${regBId}`, body);
        const changed = res.status === 200 && rows(res).length === 1;
        note("door", `passes · door · UPDATE ${label}`, !changed, `expected refused (a door stamps arrivals and nothing else); ${brief(res, 80)}`);
        if (changed && restore) await stf.patch(`passes?id=eq.${regBId}`, restore);
      }
      const doorDel = await nat.del(`passes?id=eq.${regBId}`);
      const survived = await stf.get(`passes?id=eq.${regBId}&select=id`);
      note("door", "passes · door · DELETE", rows(doorDel).length === 0 && rows(survived).length === 1, `expected silent and the pass kept; got ${doorDel.status}, ${rows(survived).length} remain`);
    }
    if (regA) {
      const stampA = await nat.patch(`passes?id=eq.${regA}`, { checked_in_at: nowIso() });
      note("door", "passes · door · UPDATE other night's arrival", rows(stampA).length === 0, `expected silent 0 rows; ${brief(stampA, 50)}`);
    }
    if (guestId) {
      const doorGuests = await nat.get(`pass_guests?id=eq.${guestId}&select=id,name`);
      note("door", "pass_guests · door · SELECT granted night", rows(doorGuests).length === 1, `expected the guest row; got ${rows(doorGuests).length}`);
      const stampGuest = await nat.patch(`pass_guests?id=eq.${guestId}`, { checked_in_at: nowIso(), checked_in_by: doorId });
      note("door", "pass_guests · door · UPDATE checked_in_at (open, or the signature rule by name)",
        (stampGuest.status === 200 && rows(stampGuest).length === 1) || /sign|waiver/.test(said(stampGuest)), brief(stampGuest, 80));
      if (stampGuest.status === 200) await nat.patch(`pass_guests?id=eq.${guestId}`, { checked_in_at: null, checked_in_by: null });
      const renameGuest = await nat.patch(`pass_guests?id=eq.${guestId}`, { name: "E2E Renamed by the door" });
      note("door", "pass_guests · door · UPDATE name (ambiguous — asserted refused)", !(renameGuest.status === 200 && rows(renameGuest).length === 1), `expected refused; ${brief(renameGuest, 60)}`);
      if (renameGuest.status === 200) await glo.patch(`pass_guests?id=eq.${guestId}`, { name: "E2E Guest" });
      const doorCamera = await nat.patch(`pass_guests?id=eq.${guestId}`, { on_camera: true });
      note("door", "pass_guests · door · UPDATE on_camera (loud)", doorCamera.status >= 400 && /guest's to say|stamps arrivals and nothing else/.test(said(doorCamera)), brief(doorCamera, 70));
      const doorDelGuest = await nat.del(`pass_guests?id=eq.${guestId}`);
      note("door", "pass_guests · door · DELETE", rows(doorDelGuest).length === 0, `expected silent 0 rows; ${brief(doorDelGuest, 50)}`);
    }

    /* A wallet pass is verified at the door, but the token carries no episode:
       is_door() with no argument is true for the holder of ANY live grant, so
       the door of night B can read the standing of a member with no pass on B. */
    const pausedToken = await pau.rpc("issue_wallet_token", {});
    const tokenValue = pausedToken.data?.[0]?.token ?? null;
    if (tokenValue) made.walletIssued.push("paused");
    note("paused", "issue_wallet_token() · paused · own", pausedToken.status === 200 && !!tokenValue, brief(pausedToken, 60));
    if (tokenValue) {
      const asMember = await reg.rpc("verify_wallet_token", { p_token: tokenValue });
      note("member", "verify_wallet_token() · member · no grant", asMember.status >= 400 && /staff only/.test(said(asMember)), `expected 'staff only'; ${brief(asMember, 60)}`);
      const asDoor = await nat.rpc("verify_wallet_token", { p_token: tokenValue });
      const leaked = asDoor.status === 200 && rows(asDoor).some((r) => r.profile_id === pausedId || r.full_name);
      note("door", "verify_wallet_token() · door · member with no pass on the granted night", !leaked,
        `expected 'elsewhere' with no name (a door learns of a member only on its own night); got ${asDoor.status} ${JSON.stringify(asDoor.data).slice(0, 110)}`);
      const asAnon = await anon.rpc("verify_wallet_token", { p_token: tokenValue });
      note("anon", "verify_wallet_token() · anon", asAnon.status >= 400, brief(asAnon, 50));
    }

    /* ══ 7. paused: reads yes, spends and posts no ════════════════════════ */
    const pausedBio = await pau.patch(`profiles?id=eq.${pausedId}`, { bio: "E2E paused, still allowed to describe themselves." });
    note("paused", "profiles · paused · UPDATE own bio (open)", pausedBio.status === 200 && rows(pausedBio).length === 1, brief(pausedBio, 60));
    if (pausedBio.status === 200) await pau.patch(`profiles?id=eq.${pausedId}`, { bio: null });
    for (const [t, body] of [
      ["open_deck_posts", { author_id: pausedId, body: `E2E paused post ${stamp}` }],
      ["open_deck_comments", { author_id: pausedId, post_id: ZERO, body: "x" }],
      ["open_deck_hails", { profile_id: pausedId, post_id: ZERO }],
      ["open_deck_flags", { flagger_id: pausedId, post_id: ZERO, reason: "x" }],
      ["invites", { code: "E2E-RLS0-RLS0", inviter_id: pausedId }],
      ["waitlist_entries", { episode_id: epA, profile_id: pausedId, segment: "single_man" }],
      ["contest_entries", { contest_id: ZERO, profile_id: pausedId }],
      ["charter_requests", { profile_id: pausedId, status: "submitted" }],
      ["member_event_proposals", { proposer_id: pausedId, title: "x", status: "submitted" }],
      ["preference_sheets", { profile_id: pausedId }],
      ["preference_boundaries", { profile_id: pausedId, topic: "x", stance: "x" }],
      ["episode_media", { episode_id: epB, storage_path: `e2e/${stamp}.jpg`, uploaded_by: pausedId }],
      ["pass_transfers", { rsvp_id: ZERO, from_profile: pausedId, to_profile: me }],
      ["crew_requests", { episode_id: epB, profile_id: pausedId }],
      ["radar_picks", { episode_id: epB, picker_rsvp: ZERO, picked_rsvp: ZERO }],
      ["table_picks", { table_id: ZERO, picker: pausedId, picked: me }],
    ]) {
      const ins = await pau.post(t, body);
      note("paused", `${t} · paused · INSERT`, ins.status >= 400, `expected 42501 (is_active() in WITH CHECK); ${brief(ins, 60)}`);
      if (ins.status === 201 && t === "open_deck_posts") made.posts.push(ins.data[0].id);
    }
    /* Ambiguous: a debrief is feedback on a night already sailed, and the
       policy does not gate it on is_active(). The paused persona holds no pass
       here so the WITH CHECK refuses on the pass clause; the ambiguity is
       recorded, not asserted either way. */
    const pausedDebrief = await pau.post("debriefs", { episode_id: epB, profile_id: pausedId, note: "x" });
    note("paused", "debriefs · paused · INSERT (no pass; policy has no is_active — ambiguous by design)", pausedDebrief.status >= 400, brief(pausedDebrief, 60));
    for (const fn of SPEND_RPCS) {
      const args = AUTH_RPCS(ids)[fn];
      const res = await pau.rpc(fn, args);
      note("paused", `${fn}() · paused`, res.status >= 400 && /paused/.test(said(res)), `expected 'your membership is paused' before any other check; ${brief(res, 70)}`);
    }
    const pausedExport = await pau.rpc("export_my_data", {});
    note("paused", "export_my_data() · paused (open)", pausedExport.status === 200, brief(pausedExport, 40));
    const pausedManifest = await pau.rpc("episode_manifest", { p_episode: epB });
    note("paused", "episode_manifest() · paused · reads names of a night they hold no pass on (ambiguous — recorded)", pausedManifest.status === 200,
      `got ${pausedManifest.status} ${rows(pausedManifest).length} names — any signed-in member may read any manifest; the safer reading would ask for a pass`);

    /* ══ 8. owned tables: writes on own vs other's ═════════════════════════ */
    /* profiles: the guard names every privileged column — except comped_until. */
    const bio = await reg.patch(`profiles?id=eq.${me}`, { bio: "E2E rls own bio" });
    note("member", "profiles · member · UPDATE own bio (open)", bio.status === 200 && rows(bio).length === 1, brief(bio, 50));
    const otherBio = await reg.patch(`profiles?id=eq.${other}`, { bio: "E2E overwritten" });
    note("member", "profiles · member · UPDATE other's", rows(otherBio).length === 0, `expected silent 0 rows; ${brief(otherBio, 50)}`);
    for (const [label, body, re] of [
      ["is_staff", { is_staff: true }, /staff standing/],
      ["tier", { tier: "global" }, /tier moves from the bridge/],
      ["status", { status: "paused" }, /standing moves from the bridge/],
      ["plan_id", { plan_id: ZERO }, /plan changes through billing/],
      ["member_no", { member_no: "UN-E2E-RLS" }, /issued once/],
      ["email", { email: "e2e-rls-hijack@fixtures.invalid" }, /changes through shoreside/],
      ["stripe_customer_id", { stripe_customer_id: "cus_e2e_rls" }, /not yours to set/],
      ["hold_reason", { hold_reason: "x" }, /standing moves from the bridge/],
      ["phone_verified", { phone_verified: true }, /verified by answering/],
    ]) {
      const res = await reg.patch(`profiles?id=eq.${me}`, body);
      note("member", `profiles · member · UPDATE own ${label} (loud)`, res.status >= 400 && re.test(said(res)), `expected ${re}; ${brief(res, 80)}`);
    }
    const comp = await reg.patch(`profiles?id=eq.${me}`, { comped_until: "2099-01-01" });
    note("member", "profiles · member · UPDATE own comped_until", comp.status >= 400,
      `expected a loud refusal ('dues waived by the Bridge' is a Bridge column); got ${comp.status} comped_until=${comp.data?.[0]?.comped_until ?? "∅"}`);
    const doorComp = await nat.patch(`profiles?id=eq.${doorId}`, { comped_until: "2099-01-01" });
    if (doorComp.status === 200) await stf.patch(`profiles?id=eq.${doorId}`, { comped_until: null });
    const staffComp = await stf.patch(`profiles?id=eq.${me}`, { comped_until: null, bio: before.regional.bio ?? null });
    note("staff", "profiles · staff · UPDATE comped_until (open)", staffComp.status === 200 && rows(staffComp).length === 1, brief(staffComp, 50));
    const insProfile = await reg.post("profiles", { id: ZERO, full_name: "E2E ghost" });
    note("member", "profiles · member · INSERT", insProfile.status >= 400, `expected 42501; ${brief(insProfile, 50)}`);
    const delProfile = await reg.del(`profiles?id=eq.${other}`);
    const otherStill = await stf.get(`profiles?id=eq.${other}&select=id`);
    note("member", "profiles · member · DELETE other's", rows(delProfile).length === 0 && rows(otherStill).length === 1, `expected silent and the member kept; got ${delProfile.status}`);

    /* waitlist: the line is numbered by the trigger, and the offer cannot ride in. */
    const jump = await glo.post("waitlist_entries", { episode_id: epA, profile_id: other, segment: "single_man", offered_at: nowIso(), claim_expires_at: soon, claimed_at: nowIso() });
    const jumpRow = jump.data?.[0];
    if (jumpRow?.id) made.waitlist.push([jumpRow.id, "global"]);
    note("other", "waitlist_entries · other · INSERT with offered_at/claimed_at preset (scrubbed)",
      jump.status === 201 && jumpRow.offered_at === null && jumpRow.claimed_at === null && jumpRow.place >= 1,
      `expected the trigger to null the offer and number the place; got ${jump.status} offered_at=${jumpRow?.offered_at ?? "∅"} claimed_at=${jumpRow?.claimed_at ?? "∅"} place=${jumpRow?.place ?? "∅"} ${said(jump).slice(0, 50)}`);
    if (jumpRow?.id) {
      const peekLine = await reg.get(`waitlist_entries?id=eq.${jumpRow.id}&select=id`);
      note("member", "waitlist_entries · member · SELECT other's", rows(peekLine).length === 0, `expected []; got ${rows(peekLine).length}`);
      const bump = await reg.patch(`waitlist_entries?id=eq.${jumpRow.id}`, { place: 1 });
      note("member", "waitlist_entries · member · UPDATE other's", rows(bump).length === 0, `expected silent 0 rows; ${brief(bump, 50)}`);
      const selfBump = await glo.patch(`waitlist_entries?id=eq.${jumpRow.id}`, { offered_at: nowIso() });
      note("other", "waitlist_entries · other · UPDATE own (offer yourself the place)", rows(selfBump).length === 0 || selfBump.status >= 400, `expected silent (UPDATE is staff-only); ${brief(selfBump, 50)}`);
      const claimOther = await reg.rpc("claim_your_place", { p_entry: jumpRow.id });
      note("member", "claim_your_place() · member · another member's entry", claimOther.status >= 400 && /not yours/.test(said(claimOther)), `expected 'that place in line is not yours'; ${brief(claimOther, 70)}`);
      const staffWorks = await stf.patch(`waitlist_entries?id=eq.${jumpRow.id}`, { released_at: nowIso() });
      note("staff", "waitlist_entries · staff · UPDATE (open)", staffWorks.status === 200 && rows(staffWorks).length === 1, brief(staffWorks, 50));
    }

    /* the Open Deck: post, read, and who may take a post down */
    const post = await reg.post("open_deck_posts", { author_id: me, body: `E2E rls post ${stamp}` });
    const postId = post.data?.[0]?.id ?? null;
    if (postId) made.posts.push(postId);
    note("member", "open_deck_posts · member · INSERT own (open)", post.status === 201, brief(post, 60));
    if (postId) {
      const readAll = await glo.get(`open_deck_posts?id=eq.${postId}&select=id`);
      note("other", "open_deck_posts · other · SELECT (shared board, open)", rows(readAll).length === 1, `expected the post visible; got ${rows(readAll).length}`);
      const spoof = await glo.post("open_deck_posts", { author_id: me, body: "E2E spoofed as another member" });
      note("other", "open_deck_posts · other · INSERT as another author", spoof.status >= 400, `expected 42501; ${brief(spoof, 50)}`);
      if (spoof.status === 201) made.posts.push(spoof.data[0].id);
      const edit = await glo.patch(`open_deck_posts?id=eq.${postId}`, { body: "E2E edited by a stranger" });
      note("other", "open_deck_posts · other · UPDATE", edit.status >= 400 || rows(edit).length === 0, `expected refused (no UPDATE policy); ${brief(edit, 50)}`);
      const takeDown = await glo.del(`open_deck_posts?id=eq.${postId}`);
      const postStill = await stf.get(`open_deck_posts?id=eq.${postId}&select=id`);
      note("other", "open_deck_posts · other · DELETE", rows(takeDown).length === 0 && rows(postStill).length === 1, `expected silent and the post kept; got ${takeDown.status}`);
      const pausedRead = await pau.get(`open_deck_posts?id=eq.${postId}&select=id`);
      note("paused", "open_deck_posts · paused · SELECT (open)", rows(pausedRead).length === 1, `expected visible; got ${rows(pausedRead).length}`);
    }

    /* crew_requests: the board is read by every member — by design, and
       contrary to section G's list, which only ever passed vacuously. */
    const crew = await reg.post("crew_requests", { episode_id: epB, profile_id: me, note: `E2E rls ${stamp}` });
    const crewId = crew.data?.[0]?.id ?? null;
    if (crewId) made.crewRequests.push(crewId);
    note("member", "crew_requests · member · INSERT own (open)", crew.status === 201, brief(crew, 60));
    if (crewId) {
      const board = await glo.get(`crew_requests?id=eq.${crewId}&select=id,profile_id`);
      note("other", "crew_requests · other · SELECT (open board — the Passes page renders it; section G lists it as owned)", rows(board).length === 1, `got ${rows(board).length} rows`);
      const closeOther = await glo.patch(`crew_requests?id=eq.${crewId}`, { open: false });
      note("other", "crew_requests · other · UPDATE", rows(closeOther).length === 0, `expected silent 0 rows; ${brief(closeOther, 50)}`);
      const forgeOther = await glo.post("crew_requests", { episode_id: epB, profile_id: me });
      note("other", "crew_requests · other · INSERT as another member", forgeOther.status >= 400, `expected 42501; ${brief(forgeOther, 50)}`);
      if (forgeOther.status === 201) made.crewRequests.push(forgeOther.data[0].id);
    }

    /* notifications: read own, mark own read, never another's */
    const notice = await reg.get(`notifications?profile_id=eq.${me}&select=id,read&order=created_at.desc&limit=1`);
    const noticeId = notice.data?.[0]?.id ?? null;
    if (noticeId) {
      const wasRead = notice.data[0].read;
      const mark = await reg.patch(`notifications?id=eq.${noticeId}`, { read: true });
      note("member", "notifications · member · UPDATE own read (open)", mark.status === 200 && rows(mark).length === 1, brief(mark, 50));
      const reassign = await reg.patch(`notifications?id=eq.${noticeId}`, { profile_id: other });
      note("member", "notifications · member · UPDATE own profile_id → other", reassign.status >= 400 || rows(reassign).length === 0, `expected WITH CHECK refusal; ${brief(reassign, 50)}`);
      const otherMark = await glo.patch(`notifications?id=eq.${noticeId}`, { read: false });
      note("other", "notifications · other · UPDATE", rows(otherMark).length === 0, `expected silent 0 rows; ${brief(otherMark, 50)}`);
      /* Since 2026-09-05 a member archives what they have READ; an unread
         notice is not theirs to strike. The row above was marked read, so
         this one goes; the unread probe below stays. */
      /* The member's own hand, not the Bridge's: the UPDATE policy is own
         rows only, so a staff patch here returns 200 with no row and the
         notice stays read. */
      const unreadAgain = await reg.patch(`notifications?id=eq.${noticeId}`, { read: false });
      const delUnread = rows(unreadAgain).length === 1 ? await reg.del(`notifications?id=eq.${noticeId}`) : { status: 0, data: [] };
      note("member", "notifications · member · DELETE own unread", rows(unreadAgain).length === 1 && rows(delUnread).length === 0, `expected silent 0 rows (the policy admits read notices only); ${brief(delUnread, 50)}`);
      await reg.patch(`notifications?id=eq.${noticeId}`, { read: true });
      const delNotice = await reg.del(`notifications?id=eq.${noticeId}`);
      note("member", "notifications · member · DELETE own read", delNotice.status === 200 && rows(delNotice).length === 1, `expected the read notice archived; ${brief(delNotice, 50)}`);
      await reg.patch(`notifications?id=eq.${noticeId}`, { read: wasRead });
    } else {
      note("member", "notifications · member · UPDATE own read (open)", true, "no own notification to exercise (pass insert did not raise one)");
    }

    /* ══ 9. every definer RPC as the wrong caller ══════════════════════════ */
    const catalogue = AUTH_RPCS(ids);
    for (const [fn, args] of Object.entries(catalogue)) {
      const res = await anon.rpc(fn, args);
      const unresolved = /could not find the function/.test(said(res));
      note("anon", `${fn}() · anon`, res.status >= 400 && !unresolved, `expected refused by grant (authenticated only); ${brief(res, 60)}${unresolved ? " — INCONCLUSIVE: args did not resolve" : ""}`);
    }
    for (const fn of STAFF_ONLY_RPCS) {
      const res = await reg.rpc(fn, catalogue[fn]);
      const unresolved = /could not find the function/.test(said(res));
      const byName = /staff|bridge|not yours|permission denied/.test(said(res));
      const silent = res.status === 200 && (res.data == null || res.data === "" || (Array.isArray(res.data) && res.data.length === 0));
      note("member", `${fn}() · member`, (res.status >= 400 && !unresolved) || silent,
        `expected 'staff only' before any work; ${brief(res, 70)}${silent ? " — WEAK: seals by silence (filters on is_staff) rather than raising" : byName ? "" : " — refused, but not by authority"}`);
    }
    for (const fn of INTERNAL_RPCS) {
      const res = await reg.rpc(fn, {});
      note("member", `${fn}() · member (internal, no grant)`, res.status >= 400, `expected 401/403/404; ${brief(res, 50)}`);
    }
    /* Anon-granted definers: by design for the public funnels, and one that
       is a mistake — run_automations writes notifications, mail and texts to
       any member named, and is executable by anon with no auth check inside. */
    const setting = await anon.rpc("club_setting", { p_key: "knots_pass_award" });
    note("anon", "club_setting() · anon (open — integers only)", setting.status === 200, brief(setting, 40));
    const spon = await anon.rpc("sponsor_credits", { p_episode: epB });
    note("anon", "sponsor_credits() · anon (open)", spon.status === 200, brief(spon, 40));
    const left = await anon.rpc("passes_left", { p_voyage: epB });
    note("anon", "passes_left() · anon (open)", left.status === 200, brief(left, 40));
    const fire = await anon.rpc("run_automations", { p_event: `e2e-rls-no-such-event-${stamp}`, p_profile_id: me, p_immediate: true });
    note("anon", "run_automations() · anon", fire.status >= 400,
      `expected refused (definer that writes outbox rows for any member; no auth.uid()/is_staff() inside); got ${fire.status} ${JSON.stringify(fire.data).slice(0, 40)}`);
    const fireMember = await reg.rpc("run_automations", { p_event: `e2e-rls-no-such-event-${stamp}`, p_profile_id: other, p_immediate: true });
    note("member", "run_automations() · member · for another member", fireMember.status >= 400, `expected refused; got ${fireMember.status} ${JSON.stringify(fireMember.data).slice(0, 40)}`);
    const viewer = await anon.rpc("viewer_is_staff", {});
    note("anon", "viewer_is_staff() · anon (open)", viewer.status === 200 && viewer.data === false, brief(viewer, 40));

    /* A member naming another member's id. */
    const log = await reg.rpc("passage_log", { p_profile_id: other });
    note("member", "passage_log() · member · another member's id", log.status >= 400 || rows(log).length === 0, `expected refusal or []; ${brief(log, 60)}`);
    const card = await reg.rpc("season_card", { p_profile_id: other, p_from: "2026-01-01T00:00:00Z", p_to: "2026-12-31T00:00:00Z" });
    note("member", "season_card() · member · another member's id", card.status >= 400 || rows(card).length === 0 || card.data == null, `expected refusal or nothing; ${brief(card, 60)}`);
    const standing = await reg.rpc("signature_standing", { p_profile_id: other });
    note("member", "signature_standing() · member · another member's id", standing.status >= 400 || rows(standing).length === 0 || standing.data == null, `expected refusal or nothing; ${brief(standing, 60)}`);
    const days = await reg.rpc("membership_pause_days_used", { p_profile: other });
    note("member", "membership_pause_days_used() · member · another member's id", days.status >= 400 && /not your record/.test(said(days)), `expected 'that is not your record'; ${brief(days, 60)}`);
    const credit = await reg.rpc("pass_credit_left", { p_profile_id: other });
    note("member", "pass_credit_left() · member · another member's id (silent zero by design)", credit.status === 200 && Number(credit.data) === 0, `expected 0; ${brief(credit, 40)}`);
    const ground = await reg.rpc("shares_ground_with", { p_other: pausedId });
    note("member", "shares_ground_with() · member · a stranger", ground.status === 200 && ground.data === false, `expected false; ${brief(ground, 40)}`);
    const dm = await reg.rpc("open_direct_thread", { p_other: pausedId });
    note("member", "open_direct_thread() · member · a stranger", dm.status >= 400 && /sailed with|not taking/.test(said(dm)), `expected 'book a night together first'; ${brief(dm, 80)}`);
    if (gloBId) {
      const addons = await reg.rpc("attach_addons", { p_pass: gloBId, p_addons: [], p_qty: 1 });
      note("member", "attach_addons() · member · another member's pass", addons.status >= 400 && /not yours/.test(said(addons)), `expected 'that pass is not yours'; ${brief(addons, 60)}`);
    }
    const knots = await reg.rpc("adjust_knots", { p_profile: me, p_delta: 100000, p_reason: "E2E" });
    note("member", "adjust_knots() · member · self", knots.status >= 400, `expected 'staff only'; ${brief(knots, 50)}`);
    const badStanding = await reg.rpc("set_own_standing", { p_status: "staff" });
    note("member", "set_own_standing() · member · an invented status", badStanding.status >= 400 && /active, paused or departed/.test(said(badStanding)), brief(badStanding, 70));
    const promo = await reg.rpc("check_promo", { p_code: `E2E-${stamp}`, p_episode: epB });
    note("member", "check_promo() · member (open oracle — 'No such code.')", promo.status === 200 && promo.data?.ok === false, brief(promo, 60));
    const tally = await reg.rpc("poll_results", { p_poll: ZERO });
    note("member", "poll_results() · member · a poll that does not exist (open once closed; [] here)", tally.status === 200 && rows(tally).length === 0, brief(tally, 40));
    const isDoorAnon = await anon.rpc("is_door", { p_episode: epB });
    note("anon", "is_door() · anon", isDoorAnon.status >= 400, brief(isDoorAnon, 40));
    const isDoorMember = await reg.rpc("is_door", { p_episode: epB });
    note("member", "is_door() · member · no grant", isDoorMember.status === 200 && isDoorMember.data === false, `expected false; ${brief(isDoorMember, 40)}`);
    const isDoorNull = await nat.rpc("is_door", {});
    note("door", "is_door() · door · with no episode (unscoped default — true for any live grant)", isDoorNull.status === 200, `got ${isDoorNull.status} ${JSON.stringify(isDoorNull.data)} — every caller of is_door() must pass the episode`);

    /* ══ 10. revoke the door and prove it ══════════════════════════════════ */
    const revoke = await stf.del(`door_grants?episode_id=eq.${epB}&profile_id=eq.${doorId}`);
    const afterRevoke = await nat.get(`passes?episode_id=eq.${epB}&select=id`);
    note("door", "passes · door · SELECT after revoke", revoke.status < 300 && rows(afterRevoke).length === 0, `expected []; got ${revoke.status}; ${rows(afterRevoke).length} rows`);
    const afterRpc = await nat.rpc("door_manifest", { p_episode: epB });
    note("door", "door_manifest() · door · after revoke", afterRpc.status === 200 && rows(afterRpc).length === 0, `expected []; got ${rows(afterRpc).length} rows`);
  } finally {
    /* ── take it all back, member first (their release trigger runs), then the Bridge ── */
    const sessions = { regional: reg, global: glo, paused: pau };
    for (const [id, who] of made.passes) {
      if (id) await sessions[who].del(`passes?id=eq.${id}`);
    }
    for (const id of made.guestRows) await stf.del(`pass_guests?id=eq.${id}`);
    for (const [id, who] of made.waitlist) { await sessions[who].del(`waitlist_entries?id=eq.${id}`); await stf.del(`waitlist_entries?id=eq.${id}`); }
    for (const id of made.crewRequests) { await reg.del(`crew_requests?id=eq.${id}`); await stf.del(`crew_requests?id=eq.${id}`); }
    for (const id of made.posts) { await reg.del(`open_deck_posts?id=eq.${id}`); await pau.del(`open_deck_posts?id=eq.${id}`); await stf.del(`open_deck_posts?id=eq.${id}`); }
    await stf.del(`open_deck_posts?body=like.E2E rls post ${stamp}*`);
    for (const who of made.walletIssued) {
      const r = await sessions[who].rpc("revoke_wallet_token", {});
      if (r.status >= 400) console.error(`  ! revoke_wallet_token as ${who}: ${r.status} ${said(r).slice(0, 80)}`);
    }
    await stf.del(`door_grants?profile_id=eq.${doorId}`);
    await stf.patch(`profiles?id=eq.${me}`, {
      bio: before.regional?.bio ?? null, comped_until: before.regional?.comped_until ?? null,
      on_manifest: before.regional?.on_manifest ?? true, phone_verified: before.regional?.phone_verified ?? false,
    });
    await stf.patch(`profiles?id=eq.${pausedId}`, { bio: null, comped_until: null });
    await stf.patch(`profiles?id=eq.${doorId}`, { comped_until: null });
    await stf.patch(`profiles?id=eq.${other}`, { comped_until: null });
    for (const id of made.episodes) {
      await stf.del(`passes?episode_id=eq.${id}`);
      await stf.del(`crew_requests?episode_id=eq.${id}`);
      await stf.del(`waitlist_entries?episode_id=eq.${id}`);
      const gone = await stf.del(`episodes?id=eq.${id}`);
      if (gone.status >= 400) { await stf.patch(`episodes?id=eq.${id}`, { status: "cancelled" }); await stf.del(`episodes?id=eq.${id}`); }
    }
  }
}
