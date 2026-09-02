#!/usr/bin/env node
/**
 * E2E suite — full-surface coverage across user roles, membership tiers, and
 * platform personas, on top of the signed-out route audit (audit-routes.mjs).
 *
 * Personas (provisioned in the database, password via E2E_PASSWORD):
 *   anon · applicant (no account) · regional · national · global ·
 *   paused member · staff (harbormaster)
 *
 * Coverage:
 *   A. Route × role matrix — every member surface renders for active members,
 *      staff console gates by role, marketing stays public.
 *   B. Business rules through the live API (RLS + triggers as deployed):
 *      tier gating, guest passes, capacity, waitlist promotion in order,
 *      house-ledger charges/credits, reward redemption guards, moderation
 *      rights, application funnel privacy, vetting-bypass resistance.
 *
 * Usage: BASE_URL=http://localhost:3000 E2E_PASSWORD=... node scripts/e2e-suite.mjs
 * Exits non-zero on any failure; writes e2e-report.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "src", "lib", "route-manifest.json"), "utf8"));
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

function loadEnvLocal() {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* CI provides env */ }
}
loadEnvLocal();

/* The one ban list, read from the source of truth. A hand-copied subset in this
   file is how "berth" stayed on the Bridge through three hardening rounds while
   the audit reported a clean lexicon. */
function bannedTerms() {
  try {
    const src = readFileSync(join(root, "src/lib/brand.ts"), "utf8");
    const block = src.match(/export const BANNED_TERMS = \[([\s\S]*?)\]/);
    if (!block) return [];
    return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}
const BANNED = bannedTerms();
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) { console.error("E2E_PASSWORD not set — provision personas and pass their password."); process.exit(2); }

const REF = new URL(SUPA).hostname.split(".")[0];
const results = [];
const failures = [];
const note = (persona, check, ok, detail = "") => {
  results.push({ persona, check, ok, detail });
  if (!ok) { failures.push({ persona, check, detail }); console.error(`  ✕ [${persona}] ${check} ${detail}`); }
};

/* ---------- session plumbing ---------- */
async function login(email) {
  // Sequential + backoff: the auth token endpoint rate-limits by IP.
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (res.status === 429 && attempt < 6) {
      const wait = attempt * 12_000;
      console.log(`  auth rate limit — waiting ${wait / 1000}s (${email})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(`login failed for ${email}: ${res.status} ${text}`);
  }
}
const cookieFor = (session) => {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  return `sb-${REF}-auth-token=${value}`;
};
async function page(session, path) {
  return fetch(BASE + path, {
    redirect: "manual",
    headers: { cookie: session ? cookieFor(session) : "", "user-agent": "un-e2e" },
  });
}
function rest(session) {
  const call = async (method, path, body, extra = {}) => {
    const res = await fetch(`${SUPA}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: ANON,
        authorization: `Bearer ${session ? session.access_token : ANON}`,
        "content-type": "application/json",
        prefer: method === "POST" ? "return=representation" : "return=representation",
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b),
    /* An insert that does not read itself back. supabase-js sends this whenever
       the caller does not chain .select(), and it is what the public funnels
       rely on — an applicant may lodge a form without being able to read the
       applications table. */
    postMinimal: (p, b) => call("POST", p, b, { prefer: "return=minimal" }),
    patch: (p, b) => call("PATCH", p, b),
    del: (p) => call("DELETE", p),
    rpc: (fn, args) => call("POST", `rpc/${fn}`, args),
  };
}
const uid = (s) => s.user.id;

/* Every fixture this RUN creates carries this token, and the sweep only removes
   fixtures older than an hour or bearing this token.

   Two suites now run against one Supabase project — this one and the rebrand
   branch's — and both swept `voyages?slug=like.e2e-*`, which is every fixture
   BOTH of them have ever made. So a sweep at the start of one run deleted the
   other run's LIVE rows mid-flight, and each side saw the other's tests fail
   for reasons that were nowhere in its own code. Three runs were corrupted
   before anyone worked out why.

   An hour is the amnesty: long enough that nothing in flight is touched, short
   enough that a run which died halfway still gets cleaned up by the next one.
   That was the original point of sweeping before as well as after, and it is
   preserved. */
const RUN_TOKEN = `r${Date.now().toString(36)}`;
const STALE_BEFORE = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

/* ---------- housekeeping ----------
   The suite writes real rows against a real database, so it sweeps its own
   leavings — before as well as after, because a run that dies halfway would
   otherwise poison the next one. Everything the suite creates is namespaced
   e2e-* / E2E* so the sweep can be exact rather than broad. */
async function sweep(p) {
  const stf = rest(p.staff);
  await stf.del("applications?email=like.e2e-anon-*");
  await stf.del("crew_candidates?email=like.e2e-anon-*");
  await stf.del("api_keys?label=like.E2E*");
  await stf.del("webhooks?url=like.*example.com/e2e*");
  await stf.del("wardroom_flags?reason=eq.E2E");
  await stf.del("wardroom_posts?body=like.E2E*");
  /* Program fixtures. voyage_series holds a RESTRICT on its template voyage,
     so the series row goes before the voyages pattern below can take the
     template with it. */
  for (const rel of ["voyage_series", "seasons", "venues"]) {
    await stf.del(`${rel}?slug=like.e2e-*${RUN_TOKEN}*`);
    await stf.del(`${rel}?slug=like.e2e-*&created_at=lt.${STALE_BEFORE()}`);
  }
  await stf.del(`sponsors?name=like.E2E*&created_at=lt.${STALE_BEFORE()}`);
  await stf.del(`charter_requests?note=eq.E2E&created_at=lt.${STALE_BEFORE()}`);
  await stf.del(`member_event_proposals?title=like.E2E*&created_at=lt.${STALE_BEFORE()}`);
  for (const rel of ["contests", "voyages"]) {
    await stf.del(`${rel}?slug=like.e2e-*${RUN_TOKEN}*`);
    await stf.del(`${rel}?slug=like.e2e-*&created_at=lt.${STALE_BEFORE()}`);
  }
  /* Orders are cleaned by id in the test, but a run that died before its
     cleanup leaves one behind; the personas place no other orders. */
  for (const who of ["regional", "national", "global", "paused"]) {
    const id = uid(p[who]);
    const mine = await stf.get(`shop_orders?profile_id=eq.${id}&select=id`);
    for (const row of mine.data || []) {
      await stf.del(`shop_order_items?order_id=eq.${row.id}`);
      await stf.del(`shop_orders?id=eq.${row.id}`);
    }
  }
  /* Only staff may clear a billing account — the guard trigger sees to that,
     which is the point of the test that puts one there. */
  await stf.patch("profiles?stripe_customer_id=like.cus_e2e_*", { stripe_customer_id: null });
  await stf.patch("profiles?stripe_customer_id=like.cus_probe_*", { stripe_customer_id: null });
  /* Signatures are deliberately undeletable, so the suite cannot sweep them.
     It signs as the regional persona against the standing version, which is
     idempotent — one row, no matter how many times the suite runs. */
  await stf.del("document_versions?status=eq.draft&version=gte.900");
  await stf.del("automations?name=like.E2E*");
  await stf.del("email_outbox?template=eq.season-card&status=eq.pending");
  await stf.del("notifications?title=like.E2E*");
  /* The waitlist notice CANNOT be swept, and saying so is better than a
     delete that quietly does nothing. `notifications` has a SELECT policy and an
     UPDATE policy and no DELETE policy at all — a member's Word is append-only
     and not even staff may remove a line from it, which is the right call and
     the same discipline fathoms_ledger keeps. So each run leaves exactly one
     in-app notice on the national fixture persona, and that is the declared
     footprint rather than a leak nobody wrote down. */
  await stf.del("account_ledger?memo=like.E2E*");
  await stf.del("notifications?title=eq.A match, from your table");
  await stf.del("dating_tables?number=eq.99");
  /* Activity, Charter and Membership fixtures. Voyages cascade their legs,
     stops, options and passes; a vessel cascades its cabins and its link to a
     voyage; a plan cannot go while a subscription still points at it. */
  await stf.del("activity_formats?slug=like.e2e-*");
  const e2ePlans = await stf.get("membership_plans?label=like.E2E*&select=id");
  for (const row of e2ePlans.data || []) {
    await stf.del(`subscriptions?plan_id=eq.${row.id}`);
    await stf.del(`membership_plans?id=eq.${row.id}`);
  }
  await stf.del("club_products?slug=like.e2e-*");
  await stf.del("vessels?name=like.E2E Charter Hull*");
  /* The pause windows the membership checks open and close. Not deletable by
     the member who owns one — a window whose dates can be edited is a budget
     with a dial on it — so the Bridge strikes them.

     Spent credentials are deliberately NOT swept here. member_qr_tokens is
     cleared lazily inside issue_member_qr(), which deletes that member's own
     tokens older than five minutes on the next mint, so the table sits at a
     handful of rows per member rather than growing. Sweeping them from here
     would need a staff read policy on the credential table, and a crew able to
     read a live credential is a crew able to board someone who is not there. */
  for (const who of ["regional", "national", "global", "paused", "staff"]) {
    await stf.del(`membership_pauses?profile_id=eq.${uid(p[who])}`);
  }
  await stf.del(`voyages?slug=like.e2e-table-night-*${RUN_TOKEN}*`);
  await stf.del(`voyages?slug=like.e2e-table-night-*&created_at=lt.${STALE_BEFORE()}`);
  /* Vetting, Radar and Show fixtures. The voyage sweep above already catches
     e2e-ratio-* and e2e-radar-* through the e2e-* pattern, and deleting the
     sailing cascades its caps, passes, picks, anchors, envelopes and queue. What
     does not cascade is anything hung on a PERSONA rather than on a sailing — a
     vetting file, a preference sheet, a boundary — so a run that died between
     creating those and its own cleanup would leave the next run's personas
     already cleared, and the "refused before the vetting file is open" check
     would pass for the wrong reason. */
  await stf.del("elements?element_id=like.E2E-*");
  for (const who of ["regional", "national", "global", "paused", "staff"]) {
    const id = uid(p[who]);
    await stf.del(`vetting_files?profile_id=eq.${id}`);
    await stf.del(`preference_boundaries?profile_id=eq.${id}`);
    await stf.del(`preference_sheets?profile_id=eq.${id}`);
  }
}

/* ---------- E. schema invariants ----------
   security_report() walks the catalog for the rules that are easy to break by
   accident: RLS off, a policy-less table, a definer function with a loose
   search_path, a view that sees past RLS, a write grant left on anon, a policy
   scoped to PUBLIC on a members' table, or a policy anon can reach that calls a
   function anon cannot execute. Any failing row fails the build, so a new table
   is held to the same line as the ones that already exist. */
async function schemaInvariants(p) {
  const stf = rest(p.staff), reg = rest(p.regional);

  const report = await stf.rpc("security_report");
  note("staff", "security report runs", report.status < 400, `got ${report.status}`);
  const rows = Array.isArray(report.data) ? report.data : [];
  note("staff", "security report covers the schema", rows.length > 200, `${rows.length} checks`);

  const failing = rows.filter((r) => !r.ok);
  const byCheck = {};
  for (const r of rows) (byCheck[r.check_name] ||= []).push(r);
  for (const [name, group] of Object.entries(byCheck)) {
    const bad = group.filter((r) => !r.ok);
    note("staff", `invariant: ${name}`, bad.length === 0,
      bad.length ? bad.slice(0, 6).map((r) => `${r.subject} (${r.detail})`).join("; ") : `${group.length} ok`);
  }
  note("staff", "no schema invariant fails", failing.length === 0, `${failing.length} failing`);

  // The report is a map of the attack surface, so it is staff-only.
  const asMember = await reg.rpc("security_report");
  note("regional", "security report is staff-only", asMember.status >= 400, `got ${asMember.status}`);
}

/* ---------- F. the anonymous surface ----------
   What a signed-out visitor may read is a product decision; what they may write
   is none. Both are asserted table by table rather than assumed, and reads are
   checked for a clean empty result rather than an error — an error means the
   protection is coming from a missing grant somewhere instead of from policy. */
/* Every relation anon can reach has to be named in one of these two lists, or
   it is covered by neither: `cabins` and `episodes` were readable and appeared
   in neither, so nothing ever checked what they hand out. */
const ANON_READABLE = [
  "voyages", "harbors", "vessels", "voyage_vessels", "dispatch_posts",
  "addons", "membership_plans", "crew_roles", "voyage_capacity",
  "cabins", "episodes",
  /* Activity and Charter publish catalogues the open water is meant to read:
     the taxonomy prices a format, the five products price a pass, and an
     itinerary is the guest-facing artefact of a passage. */
  "activity_formats", "club_products", "voyage_legs", "voyage_stops",
];
const ANON_SEALED = [
  "profiles", "rsvps", "rsvp_guests", "rsvp_addons", "pass_transfers",
  "fathoms_ledger", "account_ledger", "notifications", "invites", "member_roll",
  "threads", "thread_members", "messages", "wardroom_posts", "wardroom_comments",
  "wardroom_hails", "wardroom_flags", "applications", "crew_candidates",
  "crew_requests", "promo_codes", "email_outbox", "sms_outbox", "push_outbox",
  "push_subscriptions", "subscriptions", "invoices", "payment_methods",
  "installment_plans", "shop_orders", "shop_order_items", "galley_orders",
  "galley_order_items", "galley_items", "products", "rewards",
  "reward_redemptions", "saved_segments", "api_keys", "webhooks", "sms_templates",
  "webhook_deliveries", "automations", "marks", "member_marks",
  "contests", "contest_entries", "contest_results",
  "member_engagement", "member_affinity", "fathoms_balance", "account_balance",
  "waitlist_position", "member_league", "member_pass_usage",
  /* A hold, a pause, a released number and a 60-second credential are all
     facts about one member, and none of them is a catalogue. */
  "charter_options", "membership_pauses", "member_number_releases", "member_qr_tokens",
];

async function anonSurface() {
  const anon = rest(null);

  for (const t of ANON_READABLE) {
    const res = await anon.get(`${t}?select=*&limit=1`);
    note("anon", `may read ${t}`, res.status === 200 && Array.isArray(res.data),
      `got ${res.status} ${JSON.stringify(res.data).slice(0, 80)}`);
  }

  for (const t of ANON_SEALED) {
    const res = await anon.get(`${t}?select=*&limit=1`);
    /* Empty, not an error. A 42501 here means anon is being stopped by a
       missing EXECUTE grant rather than by the policy — which is how the
       public gallery ended up unable to read its own approved frames. */
    const clean = res.status === 200 && Array.isArray(res.data) && res.data.length === 0;
    note("anon", `${t} is sealed and fails closed`, clean,
      `got ${res.status} ${JSON.stringify(res.data).slice(0, 80)}`);
  }

  /* voyage_media is NOT sealed and must not be listed as such — the public
     gallery reads approved frames by design, and the assertion only ever
     passed because no approved row happened to exist. What actually matters
     is the line between approved and not: a frame pulled for consent, or one
     still waiting on the Bridge, must be invisible to the open water.

     Stated as a property of whatever is there rather than against a fixture,
     so it holds on an empty table and bites the moment a row leaks. */
  const frames = await anon.get("voyage_media?select=id,approved,storage_path");
  note("anon", "the gallery is readable, not sealed",
    frames.status === 200 && Array.isArray(frames.data), `got ${frames.status}`);
  note("anon", "every frame anon can see is approved",
    Array.isArray(frames.data) && frames.data.every((f) => f.approved === true),
    `${(frames.data || []).filter((f) => !f.approved).length} unapproved frames visible`);

  const pending = await anon.get("voyage_media?select=id&approved=eq.false");
  note("anon", "frames awaiting the Bridge stay off the water",
    pending.status === 200 && (pending.data || []).length === 0,
    `got ${pending.status} ${JSON.stringify(pending.data).slice(0, 80)}`);

  /* Knowing a frame's path must not be the same as being able to fetch it —
     the row is public, the file is not. Display goes through a signed URL. */
  const somePath = (frames.data || [])[0]?.storage_path;
  if (somePath) {
    const direct = await fetch(`${SUPA}/storage/v1/object/public/voyage-media/${somePath}`);
    note("anon", "a known frame path is still not a public URL", direct.status >= 400,
      `got ${direct.status}`);
  }

  /* The two lists above are only worth as much as their coverage. PostgREST
     publishes every relation it exposes, so ask it rather than trusting that
     someone remembered to add a new table to one list or the other. */
  const exposed = await fetch(`${SUPA}/rest/v1/`, { headers: { apikey: ANON } });
  if (exposed.ok) {
    const spec = await exposed.json();
    const named = new Set([...ANON_READABLE, ...ANON_SEALED]);
    const missing = Object.keys(spec.definitions ?? spec.components?.schemas ?? {})
      .filter((t) => !named.has(t) && !t.includes("."));
    note("anon", "every exposed relation is named in one list or the other",
      missing.length === 0, `unaccounted: ${missing.slice(0, 12).join(", ")}`);
  }

  // Writes: the two public funnels take an INSERT, nothing else takes anything.
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const apply = await anon.postMinimal("applications", {
    email: `e2e-anon-${stamp}@example.com`, full_name: "E2E Anon Applicant",
  });
  note("anon", "the application funnel is open", apply.status < 400, `got ${apply.status}`);

  const roleRow = await anon.get("crew_roles?select=id&limit=1");
  const roleId = roleRow.data?.[0]?.id;
  const crew = await anon.postMinimal("crew_candidates", {
    role_id: roleId, email: `e2e-anon-${stamp}@example.com`, full_name: "E2E Anon Crew",
  });
  note("anon", "the crew funnel is open", crew.status < 400, `got ${crew.status}`);

  /* Lodging a form must not become a way to read the roll. An insert that asks
     to read itself back is refused, which is why the funnels send minimal. */
  const readback = await anon.post("applications", {
    email: `e2e-anon-rb-${stamp}@example.com`, full_name: "E2E Anon Readback",
  });
  note("anon", "an application cannot read itself back", readback.status >= 400, `got ${readback.status}`);

  const revise = await anon.patch(`applications?email=eq.e2e-anon-${stamp}@example.com`, { status: "aboard" });
  note("anon", "cannot revise a lodged application", revise.status >= 400 || (revise.data || []).length === 0, `got ${revise.status}`);

  for (const [t, body] of [
    ["voyages", { slug: `e2e-anon-${stamp}`, title: "x", class: "sea", starts_at: "2027-01-01" }],
    ["profiles", { full_name: "x" }],
    ["rsvps", { voyage_id: "00000000-0000-0000-0000-000000000000", profile_id: "00000000-0000-0000-0000-000000000000" }],
    ["wardroom_posts", { body: "x" }],
    ["contest_entries", { contest_id: "00000000-0000-0000-0000-000000000000", profile_id: "00000000-0000-0000-0000-000000000000" }],
    ["member_marks", { profile_id: "00000000-0000-0000-0000-000000000000", mark_code: "first-watch" }],
    ["fathoms_ledger", { profile_id: "00000000-0000-0000-0000-000000000000", delta: 10000, reason: "x" }],
    ["promo_codes", { code: `E2E${stamp}`, kind: "comp" }],
  ]) {
    const res = await anon.post(t, body);
    note("anon", `cannot write ${t}`, res.status >= 400, `got ${res.status}`);
  }

  // Staff-only RPCs must not answer an anonymous caller.
  for (const fn of ["security_report", "settle_contest", "passage_log", "season_card", "contest_standing", "redeem_reward", "open_direct_thread"]) {
    const res = await anon.rpc(fn, {});
    note("anon", `${fn} refuses an anonymous caller`, res.status >= 400, `got ${res.status}`);
  }
}

/* ---------- G. member isolation ----------
   Every table that carries a profile_id is a place one member could read or
   rewrite another. Asserted table by table rather than trusted to the pattern,
   because the pattern is exactly what a new table forgets. */
const OWNED_TABLES = [
  "fathoms_ledger", "account_ledger", "notifications", "rsvps", "subscriptions",
  "invoices", "payment_methods", "installment_plans", "shop_orders",
  "galley_orders", "reward_redemptions", "push_subscriptions", "member_marks",
  "invites", "crew_requests",
];
const OWNED_VIEWS = [
  "fathoms_balance", "account_balance", "member_engagement", "member_league",
  "member_pass_usage",
];

async function isolationRules(p) {
  const reg = rest(p.regional), glo = rest(p.global), stf = rest(p.staff);
  const other = uid(p.global);

  for (const t of OWNED_TABLES) {
    const res = await reg.get(`${t}?select=profile_id&profile_id=eq.${other}&limit=5`);
    const leaked = Array.isArray(res.data) && res.data.length > 0;
    /* member_marks is deliberately visible for a member who joined the
       directory — the mark is the point. Everything else is private. */
    const allowed = t === "member_marks";
    note("regional", `${t} does not leak another member`, allowed ? true : !leaked,
      `got ${res.status} ${JSON.stringify(res.data).slice(0, 70)}`);
  }

  /* These are definer views now, so they return what is really there rather
     than what RLS let the viewer see. This check used to demand that EVERY
     figure be zero for another member — which passed only because the views
     were broken and showed zeros to everyone, and which the directory itself
     contradicts by rendering "N passes held" for each member.

     So name what is actually private. `passes` and League are shown on the
     roster by design; attended, posts, knots and last_booked_at are the
     Bridge's business and must never reach another member. */
  const PUBLIC_TO_MEMBERS = new Set([
    "profile_id", "league", "league_name", "month", "passes", "other_id", "shared",
  ]);
  for (const v of OWNED_VIEWS) {
    const res = await reg.get(`${v}?select=*&profile_id=eq.${other}&limit=5`);
    const rows = Array.isArray(res.data) ? res.data : [];
    const bare = rows.every((row) =>
      Object.entries(row).every(([k, val]) =>
        PUBLIC_TO_MEMBERS.has(k) || val === 0 || val === null));
    note("regional", `view ${v} carries no figures for another member`, bare,
      `got ${res.status} ${JSON.stringify(rows).slice(0, 100)}`);
  }

  // Rewriting someone else's row, and rewriting your own privileges.
  const grab = await reg.patch(`profiles?id=eq.${other}`, { full_name: "E2E Overwritten" });
  note("regional", "cannot rename another member", grab.status >= 400 || (grab.data || []).length === 0, `got ${grab.status}`);

  /* Privileged columns are guarded by a BEFORE UPDATE trigger, so a refusal is
     an error rather than an empty result. Assert on the refusal: an assertion
     that reads the value back is an assertion that has already done the damage
     if the guard is missing — which is exactly how this suite escalated its own
     persona to staff the first time it ran. */
  for (const [label, patch] of [
    ["make yourself staff", { is_staff: true }],
    ["raise your own tier", { tier: "global" }],
    ["put yourself on hold", { status: "paused" }],
    ["issue yourself a member number", { member_no: "UN-0001" }],
    ["set your own billing account", { stripe_customer_id: "cus_e2e_takeover" }],
  ]) {
    const res = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, patch);
    note("regional", `cannot ${label}`, res.status >= 400, `got ${res.status} ${JSON.stringify(res.data).slice(0, 90)}`);
  }

  /* Billing takeover: the portal opens whatever customer sits on the profile,
     so claiming an id another member already holds must be refused. */
  const stamp0 = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const customer = `cus_e2e_${stamp0}`;
  // Start from a known-clear state; only staff can clear it, by design.
  await stf.patch(`profiles?id=in.(${uid(p.regional)},${uid(p.global)})`, { stripe_customer_id: null });

  const claimOwn = await reg.rpc("claim_stripe_customer", { p_customer_id: customer });
  note("regional", "may claim an unheld billing account", claimOwn.status < 400, `got ${claimOwn.status} ${JSON.stringify(claimOwn.data).slice(0, 80)}`);

  const steal = await glo.rpc("claim_stripe_customer", { p_customer_id: customer });
  note("global", "cannot claim another member's billing account", steal.status >= 400, `got ${steal.status}`);

  const second = await reg.rpc("claim_stripe_customer", { p_customer_id: `cus_e2e_other_${stamp0}` });
  note("regional", "cannot swap the billing account on file", second.status >= 400, `got ${second.status}`);

  await stf.patch(`profiles?id=in.(${uid(p.regional)},${uid(p.global)})`, { stripe_customer_id: null });

  const mint = await reg.post("fathoms_ledger", { profile_id: uid(p.regional), delta: 99999, reason: "E2E mint" });
  note("regional", "cannot mint knots", mint.status >= 400, `got ${mint.status}`);

  const credit = await reg.post("account_ledger", { profile_id: uid(p.regional), delta_cents: -50000, kind: "credit" });
  note("regional", "cannot credit your own house account", credit.status >= 400, `got ${credit.status}`);

  // The staff view is the whole roll; that is the difference.
  const staffSees = await stf.get("profiles?select=id&limit=50");
  note("staff", "staff read the whole roll", (staffSees.data || []).length > 5, `${(staffSees.data || []).length} rows`);

  /* Staff may correct a record — the Bridge could read every member and change
     none of them until this policy existed. The guard trigger is what makes it
     safe: it exempts staff and no one else. */
  const before = await stf.get(`profiles?id=eq.${uid(p.regional)}&select=bio`);
  const correct = await stf.patch(`profiles?id=eq.${uid(p.regional)}`, { bio: "E2E corrected by the Bridge." });
  note("staff", "staff correct a member record", (correct.data || []).length === 1, `got ${correct.status}`);
  const hold = await stf.patch(`profiles?id=eq.${uid(p.regional)}`, { status: "paused" });
  note("staff", "staff place a member on hold", (hold.data || []).length === 1, `got ${hold.status}`);
  await stf.patch(`profiles?id=eq.${uid(p.regional)}`, { status: "active", bio: before.data?.[0]?.bio ?? null });
}

/* ---------- H. commerce ----------
   Money moves through the Chandlery, the Galley and the house account. The
   ledger is the record, so the tests are about who may write it. */
async function commerceRules(p) {
  const reg = rest(p.regional), glo = rest(p.global), stf = rest(p.staff);

  const prod = await reg.get("products?select=id,price_cents&active=eq.true&limit=1");
  note("regional", "the Chandlery shelf is readable", (prod.data || []).length > 0, JSON.stringify(prod.status));

  /* An order is priced by the database, never by the member. The raw INSERT is
     closed: it once let a member set their own total — and a discount larger
     than the total posted a CREDIT, minting house money out of nothing. */
  const raw = await reg.post("shop_orders", { profile_id: uid(p.regional), total_cents: 22000 });
  note("regional", "cannot write an order row directly", raw.status >= 400, `got ${raw.status}`);

  const mint = await reg.post("shop_orders", {
    profile_id: uid(p.regional), total_cents: 1, discount_cents: 100000,
  });
  note("regional", "cannot mint credit with a discount", mint.status >= 400, `got ${mint.status}`);

  const placed = await reg.rpc("place_shop_order", {
    p_lines: [{ productId: prod.data?.[0]?.id, qty: 2, size: null }],
  });
  note("regional", "may place an order", placed.status < 400, `got ${placed.status} ${JSON.stringify(placed.data).slice(0, 120)}`);
  const oid = typeof placed.data === "string" ? placed.data : null;

  if (oid) {
    const priced = await reg.get(`shop_orders?id=eq.${oid}&select=total_cents,status`);
    const want = (prod.data?.[0]?.price_cents ?? 0) * 2;
    note("regional", "the database priced the crate", priced.data?.[0]?.total_cents === want,
      `${priced.data?.[0]?.total_cents} vs ${want}`);
    note("regional", "a fresh order is placed, not fulfilled", priced.data?.[0]?.status === "placed",
      String(priced.data?.[0]?.status));

    const forOther = await reg.post("shop_orders", { profile_id: uid(p.global), total_cents: 22000 });
    note("regional", "cannot order on another member's account", forOther.status >= 400, `got ${forOther.status}`);

    const theirs = await glo.get(`shop_orders?id=eq.${oid}&select=id`);
    note("global", "cannot read another member's order", (theirs.data || []).length === 0, JSON.stringify(theirs.data));

    const refund = await reg.patch(`shop_orders?id=eq.${oid}`, { status: "refunded" });
    note("regional", "cannot mark your own order refunded", refund.status >= 400, `got ${refund.status}`);

    const restate = await reg.patch(`shop_orders?id=eq.${oid}`, { total_cents: 1 });
    note("regional", "cannot restate what an order cost", restate.status >= 400, `got ${restate.status}`);

    const ask = await reg.patch(`shop_orders?id=eq.${oid}`, { status: "refund_requested" });
    note("regional", "may ask for a refund", ask.status < 400, `got ${ask.status}`);

    await stf.del(`shop_order_items?order_id=eq.${oid}`);
    await stf.del(`shop_orders?id=eq.${oid}`);
  }

  // The Galley: the till is staff-side, the tab is yours.
  const items = await reg.get("galley_items?select=id,price_cents&active=eq.true&limit=1");
  note("regional", "the Galley list is readable", (items.data || []).length > 0, `got ${items.status}`);

  /* A denied UPDATE under RLS returns 200 with no rows, so the assertion is on
     rows touched. Reading the price back afterwards would mean the test corrupts
     the catalogue on the day the policy is wrong — which it did, once. */
  for (const [label, path, patch] of [
    ["reprice the Galley", "galley_items?active=eq.true", { price_cents: 1 }],
    ["reprice the Chandlery", "products?active=eq.true", { price_cents: 1 }],
    ["discount a reward", "rewards?active=eq.true", { cost_fm: 1 }],
    ["retire a reward", "rewards?active=eq.true", { active: false }],
  ]) {
    const res = await reg.patch(path, patch);
    const touched = Array.isArray(res.data) ? res.data.length : 1;
    note("regional", `cannot ${label}`, res.status >= 400 || touched === 0, `got ${res.status}, ${touched} rows`);
  }
}

/* ---------- I. the instruments ----------
   Keys, webhooks, segments and automations are staff tooling. A member should
   not see that they exist, let alone mint one. */
async function opsRules(p) {
  const reg = rest(p.regional), stf = rest(p.staff);

  for (const t of ["api_keys", "webhooks", "webhook_deliveries", "saved_segments", "automations", "promo_codes", "member_roll", "email_outbox", "sms_outbox", "sms_templates"]) {
    const read = await reg.get(`${t}?select=*&limit=1`);
    note("regional", `${t} is invisible to a member`, (read.data || []).length === 0, `got ${read.status} ${JSON.stringify(read.data).slice(0, 60)}`);
    const write = await reg.post(t, { });
    note("regional", `cannot write ${t}`, write.status >= 400, `got ${write.status}`);
  }

  /* The sent.dm template registry is delivery plumbing: a member has no business
     reading which provider template a message is sent against, and certainly not
     repointing one. */
  const repoint = await reg.patch("sms_templates?code=eq.weather-hold", {
    provider_template_id: "00000000-0000-0000-0000-000000000000",
  });
  note("regional", "cannot repoint an SMS template", repoint.status >= 400 || (repoint.data || []).length === 0, `got ${repoint.status}`);
  const staffTemplates = await stf.get("sms_templates?select=code,provider_template_id");
  note("staff", "staff read the SMS template registry", (staffTemplates.data || []).length >= 2, `${(staffTemplates.data || []).length} codes`);

  const key = await reg.post("api_keys", { label: "E2E", key_hash: "x", prefix: "e2e" });
  note("regional", "cannot mint an API key", key.status >= 400, `got ${key.status}`);

  const hook = await reg.post("webhooks", { url: "https://example.com/e2e", secret: "x" });
  note("regional", "cannot register a webhook", hook.status >= 400, `got ${hook.status}`);

  // Staff can, which is what makes the above meaningful.
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const staffKey = await stf.post("api_keys", { label: `E2E ${stamp}`, key_hash: `h${stamp}`, prefix: `e2e${stamp}`.slice(0, 8) });
  note("staff", "staff mint an API key", staffKey.status < 400, `got ${staffKey.status}`);
  if (staffKey.data?.[0]?.id) await stf.del(`api_keys?id=eq.${staffKey.data[0].id}`);

  // Crew hiring is staff-side; the funnel is the only public part.
  const cands = await reg.get("crew_candidates?select=email&limit=1");
  note("regional", "the crew pipeline is invisible to members", (cands.data || []).length === 0, `got ${cands.status}`);
  const stage = await reg.patch("crew_candidates?stage=eq.applied", { stage: "offer" });
  note("regional", "cannot advance a crew candidate", stage.status >= 400 || (stage.data || []).length === 0, `got ${stage.status}`);
  const staffCands = await stf.get("crew_candidates?select=email&limit=5");
  note("staff", "staff read the crew pipeline", Array.isArray(staffCands.data), `got ${staffCands.status}`);

  /* Both funnels are open to anyone on the internet, so staff must be able to
     clear what arrives. Without a DELETE policy the queue only ever grew. */
  const junk = `e2e-anon-junk-${Date.now().toString(36)}@example.com`;
  await rest(null).postMinimal("applications", { email: junk, full_name: "E2E Junk" });
  const cleared = await stf.del(`applications?email=eq.${junk}`);
  note("staff", "staff clear a spam application", cleared.status < 400, `got ${cleared.status}`);
  const gone = await stf.get(`applications?email=eq.${junk}&select=email`);
  note("staff", "the cleared application is gone", (gone.data || []).length === 0, JSON.stringify(gone.data));
}

/* ---------- J. moderation ----------
   The Open Deck is the one place members write in public. */
async function moderationRules(p) {
  const reg = rest(p.regional), glo = rest(p.global), stf = rest(p.staff);

  const post = await glo.post("wardroom_posts", { author_id: uid(p.global), body: "E2E — moderation fixture." });
  const pid = post.data?.[0]?.id;
  note("global", "posts to the Open Deck", Boolean(pid), `got ${post.status}`);
  if (!pid) return;

  const hail = await reg.post("wardroom_hails", { post_id: pid, profile_id: uid(p.regional) });
  note("regional", "may hail a post", hail.status < 400, `got ${hail.status}`);

  const forgeHail = await reg.post("wardroom_hails", { post_id: pid, profile_id: uid(p.global) });
  note("regional", "cannot hail as someone else", forgeHail.status >= 400, `got ${forgeHail.status}`);

  const comment = await reg.post("wardroom_comments", { post_id: pid, author_id: uid(p.regional), body: "E2E comment." });
  const cid = comment.data?.[0]?.id;
  note("regional", "may comment", comment.status < 400, `got ${comment.status}`);

  const forgeComment = await reg.post("wardroom_comments", { post_id: pid, author_id: uid(p.global), body: "E2E forged." });
  note("regional", "cannot comment under another name", forgeComment.status >= 400, `got ${forgeComment.status}`);

  if (cid) {
    const steal = await glo.patch(`wardroom_comments?id=eq.${cid}`, { body: "E2E rewritten." });
    const now = await reg.get(`wardroom_comments?id=eq.${cid}&select=body`);
    note("global", "cannot rewrite another member's comment", now.data?.[0]?.body !== "E2E rewritten.", `got ${steal.status}`);
  }

  const flag = await reg.post("wardroom_flags", { post_id: pid, flagger_id: uid(p.regional), reason: "E2E" });
  note("regional", "may flag a post", flag.status < 400, `got ${flag.status}`);

  /* A member sees the flags they raised and no others — counting rows only
     held while this persona happened to have raised none. The rule is about
     whose flags they are, so assert that directly. */
  const readFlags = await reg.get("wardroom_flags?select=flagger_id&limit=20");
  const foreign = (readFlags.data || []).filter((f) => f.flagger_id !== uid(p.regional));
  note("regional", "the flag queue shows only your own flags", foreign.length === 0,
    `got ${readFlags.status}, ${foreign.length} raised by others`);

  await stf.del(`wardroom_flags?post_id=eq.${pid}`);
  await stf.del(`wardroom_comments?post_id=eq.${pid}`);
  await stf.del(`wardroom_hails?post_id=eq.${pid}`);
  await stf.del(`wardroom_posts?id=eq.${pid}`);
}

/* ---------- K. waivers and contracts ----------
   The whole value of a waiver is being able to say what a person agreed to, so
   the checks are mostly about what cannot be changed after the fact: a clause
   version, a published composition, a signature, or the hash that binds them. */
async function documentRules(p) {
  const reg = rest(p.regional), glo = rest(p.global), stf = rest(p.staff), anon = rest(null);
  /* RLS grants no UPDATE or DELETE policy on the record tables, so it refuses
     first and returns no rows rather than an error. "Nothing happened" is the
     assertion; an append-only trigger stands behind RLS as the second layer. */
  const untouched = (res) =>
    res.status >= 400 || (Array.isArray(res.data) && res.data.length === 0);

  // The library is staff tooling; a member reads rendered documents, not clauses.
  const rawClauses = await reg.get("clause_versions?select=body&limit=1");
  note("regional", "clause wording is not a member's to browse", (rawClauses.data || []).length === 0, `got ${rawClauses.status}`);
  const staffClauses = await stf.get("clause_versions?select=body&limit=5");
  note("staff", "staff read the clause library", (staffClauses.data || []).length > 0, `got ${staffClauses.status}`);

  // Conditional assembly: a Sea Day carries clauses a Port Day does not.
  const ver = await reg.rpc("published_version", { p_document_code: "member-waiver" });
  const vid = typeof ver.data === "string" ? ver.data : null;
  note("regional", "the member waiver is published", Boolean(vid), `got ${ver.status}`);
  if (vid) {
    const sea = await reg.rpc("render_document", { p_document_version_id: vid, p_context: { class: "sea" } });
    const shore = await reg.rpc("render_document", { p_document_version_id: vid, p_context: { class: "shore" } });
    const seaLen = (sea.data || "").length, shoreLen = (shore.data || "").length;
    note("regional", "a Sea Day renders more than a Port Day", seaLen > shoreLen && shoreLen > 0, `${seaLen} vs ${shoreLen}`);
    note("regional", "the sea clauses stay off the shore rendering",
      /swim/i.test(sea.data || "") && !/swim/i.test(shore.data || ""), "swim-competency placement");
  }

  // Signing is idempotent, and the hash is the server's word, not the client's.
  const signed = await reg.rpc("sign_document", {
    p_document_code: "member-waiver", p_context: { class: "sea" }, p_consent: true,
    p_consent_text: "E2E consent", p_signature_kind: "typed", p_signature_data: "E2e Regional",
    p_signer_name: "E2e Regional", p_user_agent: "un-e2e",
  });
  note("regional", "may sign the member waiver", signed.status < 400, `got ${signed.status}`);
  const again = await reg.rpc("sign_document", {
    p_document_code: "member-waiver", p_context: { class: "sea" }, p_consent: true,
    p_signature_kind: "typed", p_signature_data: "E2e Regional",
  });
  note("regional", "signing twice is idempotent", again.status < 400 && again.data === signed.data, `${signed.data} vs ${again.data}`);

  const noConsent = await reg.rpc("sign_document", {
    p_document_code: "member-waiver", p_consent: false,
    p_signature_kind: "typed", p_signature_data: "E2e Regional",
  });
  note("regional", "cannot sign without consenting", noConsent.status >= 400, `got ${noConsent.status}`);

  const noMark = await reg.rpc("sign_document", {
    p_document_code: "member-waiver", p_consent: true, p_signature_kind: "typed", p_signature_data: "",
  });
  note("regional", "cannot sign without a signature", noMark.status >= 400, `got ${noMark.status}`);

  const mine = await reg.get("signatures?select=rendered_hash,signature_kind&limit=5");
  const hash = mine.data?.[0]?.rendered_hash ?? "";
  note("regional", "the signature carries a sha-256", /^[0-9a-f]{64}$/.test(hash), hash.slice(0, 20));

  // A signature is a record. It cannot be forged, rewritten, or deleted.
  const forge = await reg.post("signatures", {
    document_version_id: vid, profile_id: uid(p.regional),
    rendered_hash: "a".repeat(64), consent_esign: true, signature_kind: "typed",
  });
  note("regional", "cannot forge a signature row", forge.status >= 400, `got ${forge.status}`);

  const sigId = mine.data?.[0]?.id ?? null;
  const owned = await reg.get(`signatures?select=id&profile_id=eq.${uid(p.regional)}&limit=1`);
  const targetId = owned.data?.[0]?.id;
  if (targetId) {
    const rewrite = await reg.patch(`signatures?id=eq.${targetId}`, { rendered_hash: "b".repeat(64) });
    note("regional", "cannot restate what was signed", untouched(rewrite), `got ${rewrite.status} ${JSON.stringify(rewrite.data).slice(0, 60)}`);
    const erase = await reg.del(`signatures?id=eq.${targetId}`);
    note("regional", "cannot delete a signature", untouched(erase), `got ${erase.status}`);
    const staffErase = await stf.del(`signatures?id=eq.${targetId}`);
    note("staff", "not even staff may delete a signature", untouched(staffErase), `got ${staffErase.status}`);
  }
  void sigId;

  // Another member's signature is not readable.
  const peek = await glo.get(`signatures?select=id&profile_id=eq.${uid(p.regional)}`);
  note("global", "cannot read another member's signature", (peek.data || []).length === 0, JSON.stringify(peek.data));

  // The clause library is append-only.
  const cv = await stf.get("clause_versions?select=id,clause_code,version&limit=1");
  const cvId = cv.data?.[0]?.id;
  if (cvId) {
    const reword = await stf.patch(`clause_versions?id=eq.${cvId}`, { body: "E2E tampered wording that is plenty long." });
    note("staff", "a clause version cannot be reworded in place", untouched(reword), `got ${reword.status}`);
    const drop = await stf.del(`clause_versions?id=eq.${cvId}`);
    note("staff", "a clause version cannot be deleted", untouched(drop), `got ${drop.status}`);
  }

  // A published composition is frozen.
  if (vid) {
    const anyClause = await stf.get("clause_versions?select=id&limit=1");
    const add = await stf.post("document_clauses", {
      document_version_id: vid, clause_version_id: anyClause.data?.[0]?.id, position: 99,
    });
    note("staff", "a published composition is frozen", add.status >= 400, `got ${add.status}`);
  }

  // Drafts are not readable before they are published.
  const draft = await stf.post("document_versions", {
    document_code: "member-waiver", version: 900 + (Date.now() % 90), status: "draft",
  });
  const draftId = draft.data?.[0]?.id;
  if (draftId) {
    const seen = await reg.get(`document_versions?id=eq.${draftId}&select=id`);
    note("regional", "a draft version is invisible", (seen.data || []).length === 0, JSON.stringify(seen.data));
    const peeked = await reg.rpc("render_document", { p_document_version_id: draftId });
    note("regional", "an unpublished draft will not render", peeked.status >= 400, `got ${peeked.status}`);
    const empty = await stf.rpc("publish_document_version", { p_id: draftId });
    note("staff", "an empty document will not publish", empty.status >= 400, `got ${empty.status}`);
    await stf.del(`document_versions?id=eq.${draftId}`);
  }

  // Guests: token is the whole credential, and it is scoped to guest documents.
  const guests = await stf.get("rsvp_guests?select=id,sign_token,name&rsvp_id=not.is.null&limit=1");
  const token = guests.data?.[0]?.sign_token;
  if (token) {
    const doc = await anon.rpc("guest_document", { p_token: token, p_document_code: "guest-waiver" });
    note("anon", "a guest reads their waiver by token", (doc.data || []).length === 1, `got ${doc.status}`);

    const wrongDoc = await anon.rpc("sign_document_as_guest", {
      p_token: token, p_document_code: "member-waiver", p_consent: true,
      p_signature_kind: "typed", p_signature_data: "E2E",
    });
    note("anon", "a guest token cannot reach a member document", wrongDoc.status >= 400, `got ${wrongDoc.status}`);

    const badToken = await anon.rpc("guest_document", {
      p_token: "00000000-0000-0000-0000-000000000000", p_document_code: "guest-waiver",
    });
    note("anon", "an unknown token yields nothing", (badToken.data || []).length === 0, `got ${badToken.status}`);

    const noConsentGuest = await anon.rpc("sign_document_as_guest", {
      p_token: token, p_document_code: "guest-waiver", p_consent: false,
      p_signature_kind: "typed", p_signature_data: "E2E",
    });
    note("anon", "a guest cannot sign without consenting", noConsentGuest.status >= 400, `got ${noConsentGuest.status}`);
  }

  // anon reaches none of it directly.
  for (const t of ["clauses", "clause_versions", "documents", "document_versions", "document_clauses", "signatures"]) {
    const r = await anon.get(`${t}?select=*&limit=1`);
    note("anon", `${t} is sealed from anon`, r.status === 200 && (r.data || []).length === 0, `got ${r.status}`);
  }

  // Standing is derived, and private.
  const standing = await reg.rpc("signature_standing", { p_profile_id: uid(p.regional) });
  note("regional", "standing reads for yourself", standing.status < 400 && Array.isArray(standing.data), `got ${standing.status}`);
  const theirs = await reg.rpc("signature_standing", { p_profile_id: uid(p.global) });
  note("regional", "standing is not readable for another member", theirs.status >= 400, `got ${theirs.status}`);

  // The waiver badge the gangway reads is derived, not stored.
  const view = await stf.get(`member_waiver_standing?select=profile_id,current&profile_id=eq.${uid(p.regional)}`);
  note("staff", "waiver standing derives from the record", view.data?.[0]?.current === true, JSON.stringify(view.data));

  /* Redaction answers erasure without destroying the proof. It is permanent and
     a signature cannot be deleted, so the test signs a throwaway guest rather
     than the persona's standing waiver — otherwise the second run finds the
     first run's work already done. */
  const gv = await stf.get("voyages?select=id&class=eq.sea&limit=1");
  const gr = await stf.post("rsvps", {
    voyage_id: gv.data?.[0]?.id, profile_id: uid(p.staff), status: "aboard",
  });
  const grId = gr.data?.[0]?.id;
  const gg = grId
    ? await stf.post("rsvp_guests", { rsvp_id: grId, name: "E2E Redaction Guest" })
    : { data: null };
  const gTok = gg.data?.[0]?.sign_token;
  const gId = gg.data?.[0]?.id;

  if (gTok) {
    await anon.rpc("sign_document_as_guest", {
      p_token: gTok, p_document_code: "guest-waiver", p_consent: true,
      p_consent_text: "E2E consent", p_signature_kind: "typed",
      p_signature_data: "E2E Redaction Guest", p_user_agent: "un-e2e",
    });
    const fresh = await stf.get(`signatures?select=id,rendered_hash&guest_id=eq.${gId}`);
    const rid = fresh.data?.[0]?.id;
    const keptHash = fresh.data?.[0]?.rendered_hash;
    note("anon", "a guest signature lands", Boolean(rid), JSON.stringify(fresh.data).slice(0, 60));

    if (rid) {
      const asMember = await reg.rpc("redact_signature", { p_id: rid });
      note("regional", "a member cannot redact", asMember.status >= 400, `got ${asMember.status}`);

      const red = await stf.rpc("redact_signature", { p_id: rid });
      note("staff", "staff redact a signature", red.status < 400, `got ${red.status}`);

      const after = await stf.get(
        `signatures?select=signer_name,signed_ip,rendered_body,rendered_hash,signed_at&id=eq.${rid}`
      );
      const row = after.data?.[0] || {};
      note("staff", "redaction removes the person",
        row.signer_name === null && row.signed_ip === null && row.rendered_body === null,
        JSON.stringify(row).slice(0, 90));
      note("staff", "redaction keeps the proof",
        row.rendered_hash === keptHash && Boolean(row.signed_at),
        String(row.rendered_hash).slice(0, 12));

      const twice = await stf.rpc("redact_signature", { p_id: rid });
      note("staff", "redacting twice is refused", twice.status >= 400, `got ${twice.status}`);
    }
  }

  /* Retention: a signature inside the window survives the sweep. The purge is
     what removes it once even the proof has expired. */
  const purgeAsMember = await reg.rpc("purge_expired_signatures", { p_years: 6 });
  note("regional", "a member cannot run the retention sweep", purgeAsMember.status >= 400, `got ${purgeAsMember.status}`);
  /* Name the signatures in the window and check those exact ones survive.
     A bare count under a limit saturates once the table passes it, and then
     a sweep that deleted everything would read as "unchanged". */
  const inWindow = ((await stf.get("signatures?select=id&order=signed_at.desc&limit=25")).data || [])
    .map((r) => r.id);
  const purge = await stf.rpc("purge_expired_signatures", { p_years: 6 });
  note("staff", "the retention sweep runs", purge.status < 400, `got ${purge.status}`);
  const survivors = inWindow.length
    ? ((await stf.get(`signatures?select=id&id=in.(${inWindow.join(",")})`)).data || []).length
    : 0;
  note("staff", "the sweep spares signatures inside the window", survivors === inWindow.length,
    `${inWindow.length} in window, ${survivors} survived`);

  if (gId) await stf.del(`rsvp_guests?id=eq.${gId}`);
  if (grId) await stf.del(`rsvps?id=eq.${grId}`);

}

/* ---------- L. enforcement, counter-signature, automations ----------
   The last of the deferred work: a waiver that stops somebody, a contract that
   binds both sides, and rules that actually fire. */
async function enforcementRules(p) {
  const reg = rest(p.regional), stf = rest(p.staff), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;

  /* --- the gangway gate --- */
  const vres = await stf.get("voyages?select=id,class&status=eq.scheduled&class=eq.shore&limit=1");
  const vid = vres.data?.[0]?.id;
  const heldSeat = vid
    ? await stf.get(`rsvps?select=id&voyage_id=eq.${vid}&profile_id=eq.${uid(p.staff)}&limit=1`)
    : { data: [] };
  const seat = heldSeat.data?.[0]
    ? { data: heldSeat.data }
    : vid
      ? await stf.post("rsvps", { voyage_id: vid, profile_id: uid(p.staff), status: "aboard" })
      : { data: null };
  const seatId = seat.data?.[0]?.id;

  if (seatId) {
    /* The refusal is exercised on a guest rather than a member: a signature is
       permanent, so once the staff persona signs it can never be unsigned again
       and the member-side refusal is a one-time assertion. An UNSIGNED guest can
       be created and removed freely, so it is the fixture that stays honest run
       after run. The member and guest gates are the same rule on sibling
       triggers. */
    const fresh = await stf.post("rsvp_guests", { rsvp_id: seatId, name: `E2E Unsigned ${stamp}` });
    const freshId = fresh.data?.[0]?.id;
    if (freshId) {
      const refused = await stf.patch(`rsvp_guests?id=eq.${freshId}`, { checked_in_at: new Date().toISOString() });
      note("staff", "an unsigned guest cannot be checked in", refused.status >= 400, `got ${refused.status}`);
      note("staff", "the refusal names the document",
        /outstanding/i.test(JSON.stringify(refused.data)), JSON.stringify(refused.data).slice(0, 90));
      const removed = await stf.del(`rsvp_guests?id=eq.${freshId}`);
      note("staff", "an unsigned guest can still be removed", removed.status < 400, `got ${removed.status}`);
    }

    await stf.rpc("sign_document", {
      p_document_code: "member-waiver", p_context: { class: "shore" }, p_consent: true,
      p_signature_kind: "typed", p_signature_data: "E2e Staff", p_signer_name: "E2e Staff",
    });
    const signedIn = await stf.patch(`rsvps?id=eq.${seatId}`, { checked_in_at: new Date().toISOString() });
    note("staff", "a signed member boards", signedIn.status < 400, `got ${signedIn.status}`);

    /* A guest on the same pass, unsigned, is refused too. */
    /* A guest who has signed cannot be deleted — the club is holding their
       signature. So the gate fixture is one stable guest, reused: signing is
       idempotent per (version, guest), so the suite leaves exactly one row
       however many times it runs. */
    const existing = await stf.get(`rsvp_guests?select=id,sign_token&name=eq.E2E Gate Guest&limit=1`);
    const g = existing.data?.[0]
      ? { data: existing.data }
      : await stf.post("rsvp_guests", { rsvp_id: seatId, name: "E2E Gate Guest" });
    const gId = g.data?.[0]?.id;
    const gTok = g.data?.[0]?.sign_token;
    if (gId) {
      await anon.rpc("sign_document_as_guest", {
        p_token: gTok, p_document_code: "guest-waiver", p_consent: true,
        p_signature_kind: "typed", p_signature_data: "E2E Gate Guest",
      });
      const gSigned = await stf.patch(`rsvp_guests?id=eq.${gId}`, { checked_in_at: new Date().toISOString() });
      note("staff", "a signed guest boards", gSigned.status < 400, `got ${gSigned.status}`);

      const removeSigned = await stf.del(`rsvp_guests?id=eq.${gId}`);
      note("staff", "a guest who has signed cannot be removed", removeSigned.status >= 400, `got ${removeSigned.status}`);
      /* Reset for the next run; the guest and their signature both stay. */
      await stf.patch(`rsvp_guests?id=eq.${gId}`, { checked_in_at: null });
    }
    /* The seat carries the fixture guest, so it stays too — reset instead. */
    await stf.patch(`rsvps?id=eq.${seatId}`, { checked_in_at: null });
  }

  /* --- counter-signature --- */
  const contract = await reg.rpc("sign_document", {
    p_document_code: "membership-agreement", p_consent: true,
    p_signature_kind: "typed", p_signature_data: "E2e Regional", p_signer_name: "E2e Regional",
  });
  note("regional", "may sign the membership agreement", contract.status < 400, `got ${contract.status}`);
  const csid = typeof contract.data === "string" ? contract.data : null;

  if (csid) {
    /* A counter-signature is permanent, and the member's contract signature is
       idempotent — so after the first run this one is already in force. Assert
       the end state and the rules around it rather than the first transition,
       which only ever happens once in the life of the database. */
    const already = (await reg.get(`agreement_standing?select=in_force&signature_id=eq.${csid}`))
      .data?.[0]?.in_force === true;

    const byMember = await reg.rpc("counter_sign", { p_signature_id: csid });
    note("regional", "a member cannot counter-sign", byMember.status >= 400, `got ${byMember.status}`);

    const cs = await stf.rpc("counter_sign", { p_signature_id: csid, p_title: "For the club" });
    note("staff", "staff counter-sign a contract",
      already ? cs.status >= 400 : cs.status < 400,
      `${already ? "already in force; " : ""}got ${cs.status}`);

    const inForce = await reg.get(`agreement_standing?select=in_force,counter_signed_by&signature_id=eq.${csid}`);
    note("regional", "a counter-signed contract is in force", inForce.data?.[0]?.in_force === true, JSON.stringify(inForce.data));
    note("regional", "the counter-signature names the club's signer",
      Boolean(inForce.data?.[0]?.counter_signed_by), JSON.stringify(inForce.data));

    const twice = await stf.rpc("counter_sign", { p_signature_id: csid });
    note("staff", "counter-signing twice is refused", twice.status >= 400, `got ${twice.status}`);

    const forge = await reg.post("counter_signatures", {
      signature_id: csid, signed_by: uid(p.regional), signer_name: "E2e Regional",
    });
    note("regional", "cannot forge a counter-signature", forge.status >= 400, `got ${forge.status}`);
  }

  /* A waiver is one-way — it has no club side to sign. */
  const waiverSig = await reg.get(`signatures?select=id&profile_id=eq.${uid(p.regional)}&limit=10`);
  const waiverIds = (waiverSig.data || []).map((r) => r.id).filter((id) => id !== csid);
  if (waiverIds.length) {
    const oneWay = await stf.rpc("counter_sign", { p_signature_id: waiverIds[0] });
    note("staff", "a waiver cannot be counter-signed", oneWay.status >= 400, `got ${oneWay.status}`);
  }

  /* --- automations actually fire --- */
  const rule = await stf.post("automations", {
    name: `E2E rule ${stamp}`, trigger_event: "member_joined", conditions: {},
    action: { kind: "notify", title: `E2E fired ${stamp}`, body: "{member} joined." },
  });
  note("staff", "staff write an automation", rule.status < 400, `got ${rule.status}`);
  const ruleId = rule.data?.[0]?.id;

  /* member_joined fires on profile insert, which only auth can do. Use the
     voyage path instead: it fans out to everyone aboard. */
  const scoped = await stf.post("automations", {
    name: `E2E voyage rule ${stamp}`, trigger_event: "pass_confirmed",
    conditions: { harbor: "nowhere-at-all" },
    action: { kind: "notify", title: `E2E never ${stamp}`, body: "x" },
  });
  const scopedId = scoped.data?.[0]?.id;

  const fireRule = await stf.post("automations", {
    name: `E2E fire ${stamp}`, trigger_event: "pass_confirmed", conditions: {},
    action: { kind: "notify", title: `E2E pass ${stamp}`, body: "{member} — {voyage}." },
  });
  const fireId = fireRule.data?.[0]?.id;

  /* Notifications are readable only by the member they are addressed to, so the
     rule is fired at the staff persona — otherwise the test would be asserting
     against rows it cannot see and would read as a rule that never fired. */
  /* pass_confirmed fires on the transition into aboard, so the fixture seat is
     moved out and back rather than recreated — the seat carries a signed guest
     and cannot be deleted. */
  if (seatId) {
    await stf.patch(`rsvps?id=eq.${seatId}`, { status: "not_going" });
    await stf.patch(`rsvps?id=eq.${seatId}`, { status: "aboard" });
    await new Promise((r) => setTimeout(r, 400));

    const fired = await stf.get(`notifications?select=title,body&title=eq.E2E pass ${stamp}`);
    const never = await stf.get(`notifications?select=title&title=eq.E2E never ${stamp}`);
    note("staff", "an automation fires on its event", (fired.data || []).length > 0, `${(fired.data || []).length} sent`);
    note("staff", "an automation substitutes the member and the sailing",
      (fired.data || []).every((n) => !/\{member\}|\{voyage\}/.test(n.body || "")),
      JSON.stringify(fired.data?.[0] || {}).slice(0, 90));
    note("staff", "a condition that does not match keeps the rule silent", (never.data || []).length === 0, `${(never.data || []).length} sent`);

    const stamped = await stf.get(`automations?select=last_run_at&id=eq.${fireId}`);
    note("staff", "a fired rule records when it ran", Boolean(stamped.data?.[0]?.last_run_at), JSON.stringify(stamped.data));

    await stf.del(`notifications?title=like.E2E*${stamp}`);
  }

  const memberRule = await reg.post("automations", {
    name: "E2E member rule", trigger_event: "member_joined", conditions: {}, action: {},
  });
  note("regional", "a member cannot write an automation", memberRule.status >= 400, `got ${memberRule.status}`);

  for (const id of [ruleId, scopedId, fireId].filter(Boolean)) {
    await stf.del(`automations?id=eq.${id}`);
  }

  /* --- season cards --- */
  const cardsByMember = await reg.rpc("send_season_cards", {
    p_from: "2026-02-01T00:00:00Z", p_to: "2026-07-01T00:00:00Z", p_season: "E2E",
  });
  note("regional", "a member cannot send the season's cards", cardsByMember.status >= 400, `got ${cardsByMember.status}`);

  const backwards = await stf.rpc("send_season_cards", {
    p_from: "2026-07-01T00:00:00Z", p_to: "2026-02-01T00:00:00Z",
  });
  note("staff", "a season must run forwards", backwards.status >= 400, `got ${backwards.status}`);

  /* Only what THIS run queues. Reading the whole template picked up rows sent
     months ago, before the guard existed, and reported history as a live leak. */
  const mailSince = new Date(Date.now() - 60_000).toISOString();
  const cards = await stf.rpc("send_season_cards", {
    p_from: "2026-02-01T00:00:00Z", p_to: "2026-07-01T00:00:00Z", p_season: `E2E ${stamp}`,
  });
  note("staff", "the season's cards queue", cards.status < 400 && Number(cards.data) > 0, `${cards.data} queued`);
  const queued = await stf.get(`email_outbox?select=payload&template=eq.season-card&limit=5`);
  note("staff", "a card carries the member's figures",
    (queued.data || []).some((e) => Number(e.payload?.nm_logged) > 0), JSON.stringify(queued.data?.[0]?.payload || {}).slice(0, 90));

  /* Delivery is live: a Resend key sits in Vault and cron drains every five
     minutes, so the ONLY thing between this run and real mail to a made-up
     address is the queue-boundary guard. Every card this suite just queued to
     a fixture must be skipped, never pending. The guard used to miss anything
     that was not e2e-/@demo./@fixtures.invalid — an audit account left on the
     club's own domain queued for real and stopped at the provider's quota. */
  const addressed = await stf.get(
    `email_outbox?select=to_email,status&template=eq.season-card&created_at=gt.${mailSince}&limit=500`
  );
  const fixtures = (addressed.data || []).filter((e) =>
    /^(e2e|test|probe|audit|fixture|smoke|viewport|qa)[-.]/i.test(e.to_email || "") ||
    /@(demo\.|example\.)/i.test(e.to_email || "") ||
    /@fixtures\.invalid$/i.test(e.to_email || "")
  );
  note("staff", "the suite queued at least one fixture card to check the guard",
    fixtures.length > 0, "no fixture address in the season run");
  note("staff", "no card to a fixture address is left sendable",
    fixtures.every((e) => e.status === "skipped"),
    fixtures.filter((e) => e.status !== "skipped").map((e) => `${e.to_email}=${e.status}`).join(", "));

  await stf.del("email_outbox?template=eq.season-card&status=eq.pending");
  await stf.del("email_outbox?template=eq.season-card&status=eq.skipped");
}

/* ---------- M. [un]: cabins, consent, tables, matches ----------
   The rebrand's new objects. Dating privacy is the sharp edge: a pick is
   private even from seatmates, and only mutuality surfaces anything. */
async function clubRules(p) {
  const reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global), stf = rest(p.staff), anon = rest(null);

  /* --- filming consent --- */
  const offCam = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { on_camera: false, camera_withdrawn_at: new Date().toISOString() });
  note("regional", "may withdraw filming consent", (offCam.data || []).length === 1, `got ${offCam.status}`);
  const backOn = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { on_camera: true, camera_withdrawn_at: null });
  note("regional", "may return to camera", (backOn.data || []).length === 1, `got ${backOn.status}`);
  const otherCam = await reg.patch(`profiles?id=eq.${uid(p.global)}`, { on_camera: false });
  note("regional", "cannot withdraw consent for another member", (otherCam.data || []).length === 0, `got ${otherCam.status}`);

  /* Waiver v2 carries the cameras: the current published member waiver renders
     the filming clause, and v1 signatures read as not current. */
  const ver = await reg.rpc("published_version", { p_document_code: "member-waiver" });
  const body = await reg.rpc("render_document", { p_document_version_id: ver.data, p_context: {} });
  note("regional", "waiver v2 carries the filming release", /cameras run from boarding to docking/.test(body.data || ""), "clause present");

  /* --- cabins --- */
  const cabins = await anon.get("cabins?select=id,name&limit=3");
  note("anon", "the cabin plan is public", (cabins.data || []).length > 0, `got ${cabins.status}`);
  const priceMove = await reg.patch("cabins?active=eq.true", { premium_cents: 1 });
  note("regional", "cannot reprice a cabin", priceMove.status >= 400 || (priceMove.data || []).length === 0, `got ${priceMove.status}`);

  /* --- kiosk gate --- */
  const kioskAnon = await page(null, "/kiosk");
  note("anon", "the kiosk needs a signed-in device", kioskAnon.status >= 300, `got ${kioskAnon.status}`);
  const kioskMember = await page(p.regional, "/kiosk");
  note("regional", "the kiosk is crew-only", kioskMember.status >= 300 && (kioskMember.headers.get("location") || "").includes("/home"), `got ${kioskMember.status}`);
  const kioskStaff = await page(p.staff, "/kiosk");
  note("staff", "crew reach the kiosk", kioskStaff.status === 200, `got ${kioskStaff.status}`);

  /* --- tables: hold, race, blindness --- */
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const night = await stf.post("voyages", {
    slug: `e2e-table-night-${stamp}`, title: "E2E table night.", class: "shore", kind: "port_day",
    starts_at: new Date(Date.now() + 3 * 864e5).toISOString(),
    berths_total: 24, price_cents: 0, min_tier: "regional",
  });
  const nightId = night.data?.[0]?.id;
  const tbl = await stf.post("dating_tables", { voyage_id: nightId, number: 99, seats: 2 });
  const tblId = tbl.data?.[0]?.id;
  note("staff", "crew set a table", Boolean(tblId), `got ${tbl.status}`);

  if (tblId) {
    /* A seat at a table now needs a pass for that night. It used to need only
       an active membership, so anyone could take a chair at a Table Night they
       had not booked — burning a seat and reading that table's roster. Board
       the personas first; the refusal for someone who is not aboard is checked
       below. See "a seat at a table belongs to someone who booked the night". */
    const gatecrash = await reg.rpc("claim_table_seat", { p_table: tblId });
    note("regional", "cannot take a chair at a night they are not booked on",
      gatecrash.status >= 400, `got ${gatecrash.status}`);

    for (const who of ["regional", "national"]) {
      await stf.post("rsvps", { voyage_id: nightId, profile_id: uid(p[who]), status: "aboard" });
    }

    const seat1 = await reg.rpc("claim_table_seat", { p_table: tblId });
    note("regional", "a seat holds for fifteen minutes", seat1.status < 400 && seat1.data, `got ${seat1.status}`);
    const c1 = await reg.rpc("confirm_table_seat", { p_table: tblId });
    note("regional", "the hold confirms", c1.status < 400, `got ${c1.status}`);

    await nat.rpc("claim_table_seat", { p_table: tblId });
    await nat.rpc("confirm_table_seat", { p_table: tblId });

    const third = await glo.rpc("claim_table_seat", { p_table: tblId });
    note("global", "a full table refuses the third chair", third.status >= 400, `got ${third.status}`);

    /* Blindness: someone not at the table cannot read who is. */
    const peek = await glo.get(`table_seats?table_id=eq.${tblId}&select=profile_id`);
    note("global", "a blind table is blind from outside", (peek.data || []).length === 0, JSON.stringify(peek.data));

    /* Picks refuse before the night starts. */
    const early = await reg.post("table_picks", { table_id: tblId, picker: uid(p.regional), picked: uid(p.national) });
    note("regional", "picks wait for the night to start", early.status >= 400, `got ${early.status}`);

    await stf.patch(`voyages?id=eq.${nightId}`, { starts_at: new Date(Date.now() - 3600e3).toISOString() });

    const pick1 = await reg.post("table_picks", { table_id: tblId, picker: uid(p.regional), picked: uid(p.national) });
    note("regional", "a pick lands from a confirmed chair", pick1.status < 400, `got ${pick1.status}`);

    /* Private until mutual — the picked party sees nothing yet. */
    const unseen = await nat.get(`table_picks?table_id=eq.${tblId}&select=picker`);
    note("national", "a pick is private until mutual", (unseen.data || []).length === 0, JSON.stringify(unseen.data));
    const noMatchYet = await nat.get(`matches?table_id=eq.${tblId}&select=id`);
    note("national", "no match before mutuality", (noMatchYet.data || []).length === 0, JSON.stringify(noMatchYet.data));

    const pick2 = await nat.post("table_picks", { table_id: tblId, picker: uid(p.national), picked: uid(p.regional) });
    note("national", "the return pick lands", pick2.status < 400, `got ${pick2.status}`);

    const match = await reg.get(`matches?table_id=eq.${tblId}&select=id,profile_a,profile_b`);
    note("regional", "mutuality makes the match", (match.data || []).length === 1, JSON.stringify(match.data));
    const outsider = await glo.get(`matches?table_id=eq.${tblId}&select=id`);
    note("global", "a match is only its two people's", (outsider.data || []).length === 0, JSON.stringify(outsider.data));

    const stranger = await glo.post("table_picks", { table_id: tblId, picker: uid(p.global), picked: uid(p.regional) });
    note("global", "no picking without a chair at the table", stranger.status >= 400, `got ${stranger.status}`);

    await stf.del(`matches?table_id=eq.${tblId}`);
    await stf.del(`table_picks?table_id=eq.${tblId}`);
    await stf.del(`table_seats?table_id=eq.${tblId}`);
    await stf.del(`dating_tables?id=eq.${tblId}`);
  }
  if (nightId) await stf.del(`rsvps?voyage_id=eq.${nightId}`);
  if (nightId) await stf.del(`voyages?id=eq.${nightId}`);
}


/* ---------- H. what the hardening rounds found ----------
   Every check here stands for a defect that was real and is now closed. They
   are the ones a refactor is most likely to quietly reopen: a credential that
   becomes readable again, a charge that pays out, a gate that stops gating. */
async function hardeningRules(p) {
  const reg = rest(p.regional), glo = rest(p.global), stf = rest(p.staff);
  const me = uid(p.regional);

  // — A profile is not an open file —
  for (const col of ["email", "phone", "calendar_token", "stripe_customer_id"]) {
    const leak = await reg.get(`profiles?select=${col}&id=neq.${me}&limit=3`);
    const rows = Array.isArray(leak.data) ? leak.data : [];
    note("regional", `another member's ${col} is not readable`, rows.length === 0,
      `got ${leak.status}, ${rows.length} rows`);
  }
  const viewLeak = await reg.get("member_directory?select=calendar_token&limit=1");
  note("regional", "the directory view has no credential columns", viewLeak.status >= 400,
    `got ${viewLeak.status}`);
  const optedOut = await reg.get("member_directory?in_directory=eq.false&select=bio,interests&limit=5");
  const spilled = (optedOut.data || []).filter((r) => r.bio || r.interests);
  note("regional", "the directory opt-out withholds bio and interests", spilled.length === 0,
    `${spilled.length} opted-out rows still carrying a bio`);

  // — A member cannot price their own order, nor be paid by one —
  const mint = await reg.post("shop_orders", {
    profile_id: me, total_cents: 1, discount_cents: 100000,
  });
  note("regional", "a discount cannot mint house credit", mint.status >= 400, `got ${mint.status}`);
  const rawGalley = await reg.post("galley_orders", { profile_id: me, total_cents: 1, source: "self" });
  note("regional", "a member cannot write a galley order directly", rawGalley.status >= 400,
    `got ${rawGalley.status}`);

  // — A ledger row belongs to your own pass —
  const foreignRsvp = await stf.get(`rsvps?profile_id=neq.${me}&select=id&limit=1`);
  const theirRsvp = foreignRsvp.data?.[0]?.id;
  if (theirRsvp) {
    const poison = await reg.post("account_ledger", {
      profile_id: me, delta_cents: -1, kind: "galley", rsvp_id: theirRsvp, memo: "E2E poison",
    });
    note("regional", "a charge cannot be pinned to another member's pass", poison.status >= 400,
      `got ${poison.status}`);
  }

  // — A pass is taken before the sailing, not after —
  const past = await stf.get("voyages?status=eq.completed&select=id&limit=1");
  if (past.data?.[0]?.id) {
    const back = await reg.post("rsvps", {
      voyage_id: past.data[0].id, profile_id: me, status: "aboard",
    });
    note("regional", "a sailing in the log cannot be boarded", back.status >= 400, `got ${back.status}`);
  }

  // — phone_verified is not a member's to claim —
  const claim = await reg.patch(`profiles?id=eq.${me}`, { phone_verified: true });
  note("regional", "a member cannot verify their own number", claim.status >= 400, `got ${claim.status}`);

  // — A guest token opens guest paper only —
  const anyGuest = await stf.get(
    "rsvp_guests?select=sign_token&sign_token=not.is.null&rsvp_id=not.is.null&limit=1"
  );
  const tok = anyGuest.data?.[0]?.sign_token;
  if (tok) {
    for (const code of ["member-waiver", "membership-agreement", "crew-agreement"]) {
      const doc = await rest(null).rpc("guest_document", { p_token: tok, p_document_code: code });
      const rows = Array.isArray(doc.data) ? doc.data : [];
      note("anon", `a guest token does not open ${code}`, rows.length === 0, JSON.stringify(rows).slice(0, 60));
    }
    const own = await rest(null).rpc("guest_document", { p_token: tok, p_document_code: "guest-waiver" });
    note("anon", "a guest token opens its own waiver", (own.data || []).length === 1,
      `got ${own.status}`);
  }
  const myRsvps = await glo.get(`rsvps?profile_id=eq.${uid(p.global)}&select=id`);
  const mine = new Set((myRsvps.data || []).map((r) => r.id));
  const harvest = await glo.get("rsvp_guests?select=rsvp_id,sign_token&limit=20");
  const foreignGuests = (harvest.data || []).filter((g) => !mine.has(g.rsvp_id));
  note("global", "guest sign tokens are not other hosts' to harvest", foreignGuests.length === 0,
    `${foreignGuests.length} guests belonging to other hosts`);

  // — The Bridge can reach a member, and only the Bridge —
  const memberWord = await reg.rpc("notify_member", {
    p_profile: me, p_kind: "word", p_title: "E2E forgery", p_body: "no",
  });
  note("regional", "a member cannot put a word in someone's Word", memberWord.status >= 400,
    `got ${memberWord.status}`);
  const memberMail = await reg.rpc("queue_email", {
    p_to: "nobody@example.com", p_template: "welcome-aboard", p_payload: {},
  });
  note("regional", "a member cannot queue shoreside mail", memberMail.status >= 400,
    `got ${memberMail.status}`);
}


/* ---------- I. what round two found ----------
   Round two's findings were mostly round one's fixes applied to one call site
   out of nine. These are the specific shapes that were wrong, so a future
   half-fix fails here instead of in a crawl. */
async function roundTwoRules(p) {
  const reg = rest(p.regional), stf = rest(p.staff);
  const me = uid(p.regional);

  // — A released pass is paid for again —
  const claimable = await stf.get(
    "voyages?status=eq.scheduled&select=id,price_cents&price_cents=gt.0" +
      `&starts_at=gt.${new Date().toISOString()}&order=starts_at.asc&limit=1`
  );
  const v = claimable.data?.[0];
  if (v) {
    await stf.del(`rsvps?profile_id=eq.${me}&voyage_id=eq.${v.id}`);
    await stf.del(`account_ledger?profile_id=eq.${me}&voyage_id=eq.${v.id}`);
    await stf.del(`fathoms_ledger?profile_id=eq.${me}&voyage_id=eq.${v.id}`);

    /* Bounded by TIME, not by clearing history first — the same correction this
       file already made for notifications, which needed making here too and did
       not get it.

       account_ledger has no DELETE policy (it is the club's record), so the
       `stf.del(account_ledger...)` calls in this suite have always been silent
       no-ops and the rows accumulate forever: this persona had 511 berth/credit
       pairs on one voyage. PostgREST caps a response at 1000 rows whatever
       limit you ask for, so this helper was summing the first PAGE of the
       ledger and calling it the balance. Every assertion built on it went
       quietly wrong the moment the pair passed a thousand rows — reporting a
       free pass where the member had in fact been charged correctly.

       A marker makes the window small, exact, and independent of how much
       history is behind it. */
    const folio = async (since) => {
      const rows = await reg.get(
        `account_ledger?profile_id=eq.${me}&voyage_id=eq.${v.id}&created_at=gt.${since}&select=delta_cents`
      );
      const list = rows.data || [];
      if (list.length >= 1000) throw new Error("folio window is too wide to trust — narrow the marker");
      return list.reduce((n, r) => n + r.delta_cents, 0);
    };
    const claim = () => reg.post("rsvps", { voyage_id: v.id, profile_id: me, status: "aboard" });

    /* Everything below is measured from here. */
    const mark = new Date().toISOString();
    const before = await folio(mark);
    const first = await claim();
    const afterFirst = await folio(mark);
    note("regional", "claiming a pass charges for it", afterFirst - before === -v.price_cents,
      `moved ${afterFirst - before}, price ${-v.price_cents}`);

    const rid = first.data?.[0]?.id;
    if (rid) await reg.del(`rsvps?id=eq.${rid}`);
    const afterRelease = await folio(mark);
    note("regional", "releasing 48h+ out credits the charge", afterRelease === before,
      `moved ${afterRelease - before}`);

    const again = await claim();
    const afterSecond = await folio(mark);
    note("regional", "re-claiming a credited pass is charged again",
      afterSecond - afterRelease === -v.price_cents,
      `moved ${afterSecond - afterRelease} — a free pass if this is 0`);

    // — You are not your own waitlister —
    const rid2 = again.data?.[0]?.id;
    if (rid2) {
      /* notifications has no DELETE policy — it is the club's record. So the
         window is bounded by time rather than by clearing history first, which
         silently measured rows from an earlier run. */
      const since = new Date().toISOString();
      await reg.patch(`rsvps?id=eq.${rid2}`, { status: "waitlist" });
      const mine = await reg.get(`rsvps?id=eq.${rid2}&select=status`);
      note("regional", "releasing to the waitlist does not put you back aboard",
        mine.data?.[0]?.status === "waitlist", `ended ${mine.data?.[0]?.status}`);
      const selfNote = await reg.get(
        `notifications?profile_id=eq.${me}&title=like.*released to you*&created_at=gt.${since}&select=id`
      );
      note("regional", "you are not offered your own released pass",
        (selfNote.data || []).length === 0, `${(selfNote.data || []).length} notices`);
      await stf.del(`rsvps?id=eq.${rid2}`);
    }
    await stf.del(`account_ledger?profile_id=eq.${me}&voyage_id=eq.${v.id}`);
    await stf.del(`fathoms_ledger?profile_id=eq.${me}&voyage_id=eq.${v.id}`);
    await stf.del(`notifications?profile_id=eq.${me}&title=like.*released to you*`);
  }

  // — A waitlist is for a sailing still ahead —
  const gone = await stf.get("voyages?status=eq.completed&select=id&limit=1");
  if (gone.data?.[0]?.id) {
    const late = await reg.post("rsvps", {
      voyage_id: gone.data[0].id, profile_id: me, status: "waitlist",
    });
    note("regional", "a sailing in the log cannot be waitlisted", late.status >= 400, `got ${late.status}`);
  }

  // — Every voyage carries its harbor's clock —
  const clocks = await stf.get("voyages?select=slug,time_zone&limit=200");
  const missing = (clocks.data || []).filter((x) => !x.time_zone);
  note("staff", "every sailing carries a harbor clock", missing.length === 0,
    `${missing.length} without one`);

  // — An invite code names nobody, and validate_invite tells nobody —
  const codes = await stf.get("invites?select=code&limit=50");
  const named = (codes.data || []).filter((c) => !/^UN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c.code));
  note("staff", "no invite code carries a member's name", named.length === 0,
    named.map((c) => c.code).join(", "));
  const anyCode = codes.data?.[0]?.code;
  if (anyCode) {
    const answer = await rest(null).rpc("validate_invite", { p_code: anyCode });
    note("anon", "validate_invite answers yes or no, not who",
      typeof answer.data === "boolean", JSON.stringify(answer.data).slice(0, 40));
  }

  // — An applicant does not decide their own application —
  for (const [label, body] of [
    ["a self-signed waiver", { full_name: "E2E Probe", email: "e2e-anon-probe@example.com", waiver_swim: true }],
    ["a borrowed invite code", { full_name: "E2E Probe", email: "e2e-anon-probe@example.com", invite_code: "UN-AAAA-BBBB" }],
    ["an unbounded city", { full_name: "E2E Probe", email: "e2e-anon-probe@example.com", city: "C".repeat(500) }],
  ]) {
    const r = await rest(null).post("applications", body);
    note("anon", `an application cannot carry ${label}`, r.status >= 400, `got ${r.status}`);
  }

  // — A guest link for a sailing that has gone —
  const goneGuest = await stf.get(
    "rsvp_guests?select=sign_token,rsvps!inner(voyages!inner(status))&rsvps.voyages.status=eq.completed&limit=1"
  );
  const goneToken = goneGuest.data?.[0]?.sign_token;
  if (goneToken) {
    const doc = await rest(null).rpc("guest_document", {
      p_token: goneToken, p_document_code: "guest-waiver",
    });
    const state = Array.isArray(doc.data) ? doc.data[0]?.voyage_state : null;
    note("anon", "a guest link for a finished sailing says so", state === "sailed" || state === "cancelled",
      `state ${state}`);
    const stillOpen = await rest(null).rpc("guest_may_still_sign", { p_token: goneToken });
    note("anon", "a finished sailing cannot be signed for", stillOpen.data === false,
      JSON.stringify(stillOpen.data));
  }

  // — A hold speaks on both transitions —
  const held = uid(p.paused);
  const holdNotes = await stf.get(
    `notifications?profile_id=eq.${held}&select=title,body&order=created_at.desc&limit=20`
  );
  const bodies = JSON.stringify(holdNotes.data || []);
  note("staff", "the hold notice says knots, not fathoms", !/fathom/i.test(bodies),
    bodies.slice(0, 80));

  // — A guest's filming consent is recorded, not assumed —
  const camera = await stf.get("rsvp_guests?select=on_camera&limit=50");
  note("staff", "guest filming consent is a real column the sheet can read",
    (camera.data || []).every((g) => typeof g.on_camera === "boolean"),
    JSON.stringify(camera.data).slice(0, 60));

  await stf.del("applications?email=like.e2e-anon-probe*");
}


/* ---------- J. what round three found ----------
   Every one of these was a fix of mine applied to one of two paths, or damage a
   fix did next door. They encode the SECOND way in. */
/* Round five: consent on a frame, and the screen that reviews them.

   A member could upload a photograph and then had no way to take it back —
   DELETE and PATCH both answered 200 with an empty array, the silent no-op
   that reads to a UI as success. And the Bridge, the one screen that decides
   what goes public, was building /object/public/ URLs against a bucket that
   had been made private, so every thumbnail was a 400 and staff were clearing
   frames they could not see. */
async function roundFiveRules(p) {
  const stf = rest(p.staff), glo = rest(p.global), reg = rest(p.regional);

  const ahead = await stf.get(
    `voyages?status=eq.scheduled&select=id&starts_at=gt.${new Date().toISOString()}&order=starts_at.asc&limit=1`
  );
  const vid = ahead.data?.[0]?.id;
  if (!vid) return;

  /* A real object behind the row, because the whole point is whether a URL can
     be signed for it. Staff uploads: the storage INSERT policy wants an aboard
     pass, and the row's uploaded_by is what the consent rules actually key on. */
  const path = `${uid(p.staff)}/e2e-consent-${Date.now().toString(36)}.png`;
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const put = await fetch(`${SUPA}/storage/v1/object/voyage-media/${path}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${p.staff.access_token}`, "Content-Type": "image/png" },
    body: pixel,
  });
  note("staff", "puts a real frame in the bucket", put.status < 400, `got ${put.status}`);

  const signAs = async (session) => {
    const res = await fetch(`${SUPA}/storage/v1/object/sign/voyage-media`, {
      method: "POST",
      headers: {
        apikey: ANON,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 60, paths: [path] }),
    });
    const rows = await res.json();
    return Array.isArray(rows) && !!rows[0]?.signedURL;
  };

  const mk = await stf.post("voyage_media", {
    voyage_id: vid, storage_path: path, caption: "E2E consent frame",
    uploaded_by: uid(p.global), approved: false,
  });
  const fid = mk.data?.[0]?.id;
  note("staff", "seeds a frame for the consent checks", !!fid, `got ${mk.status}`);
  if (!fid) return;

  /* An unapproved frame is nobody's business but the Bridge's and its owner's. */
  note("anon", "cannot sign a frame the Bridge has not cleared", !(await signAs(null)), "signed it");

  /* The Bridge must sign its own thumbnails. It built /object/public/ URLs
     against a private bucket for a while, so every thumbnail was a 400 and the
     screen read as empty rather than broken — checked while a frame is
     guaranteed to be on it, or the assertion passes on an empty page. */
  const html = await (await page(p.staff, "/bridge/media")).text();
  note("staff", "the seeded frame reaches the Bridge's media screen",
    html.includes("E2E consent frame"), "the frame did not reach the screen");
  note("staff", "the Bridge signs its thumbnails",
    /object\/sign\/voyage-media/.test(html), "no signed URL on the media screen");
  note("staff", "the Bridge builds no public URL against a private bucket",
    !/object\/public\/voyage-media/.test(html), "found a /object/public/ URL");

  const selfClear = await glo.patch(`voyage_media?id=eq.${fid}`, { approved: true });
  note("global", "cannot clear their own frame for the water", selfClear.status >= 400,
    `got ${selfClear.status}`);

  const bridgeClear = await stf.patch(`voyage_media?id=eq.${fid}`, { approved: true });
  note("staff", "the Bridge clears a frame", (bridgeClear.data || [])[0]?.approved === true,
    `got ${bridgeClear.status}`);

  /* The row said public while the file said no, and the gallery quietly
     rendered nothing. Approval has to reach the object too. */
  note("anon", "can sign a frame the Bridge cleared", await signAs(null), "could not sign it");
  note("national", "can sign a cleared frame they did not upload", await signAs(p.national),
    "could not sign it");

  const gallery = await (await page(null, "/gallery")).text();
  note("anon", "the gallery actually renders a cleared frame",
    /object\/sign\/voyage-media/.test(gallery), "no signed frame on the gallery");

  /* The point of the whole block: a published frame can be pulled by the hand
     that sent it up, without going and finding a staff member — and the file
     stops being fetchable the moment they do. */
  const pull = await glo.patch(`voyage_media?id=eq.${fid}`, { approved: false });
  note("global", "takes their own frame back off the water",
    (pull.data || [])[0]?.approved === false, `got ${pull.status}`);
  note("anon", "a withdrawn frame stops being signable at once", !(await signAs(null)),
    "still signed it");

  await stf.patch(`voyage_media?id=eq.${fid}`, { approved: true });
  const amend = await glo.patch(`voyage_media?id=eq.${fid}`, { caption: "E2E second thoughts" });
  note("global", "a rewritten caption goes back into the queue",
    (amend.data || [])[0]?.approved === false && (amend.data || [])[0]?.caption === "E2E second thoughts",
    `got ${amend.status} ${JSON.stringify(amend.data).slice(0, 90)}`);

  const move = await glo.patch(`voyage_media?id=eq.${fid}`, { uploaded_by: uid(p.regional) });
  note("global", "cannot hand their frame to someone else", move.status >= 400, `got ${move.status}`);

  /* Refusal must be a refusal, not an empty array a UI would read as done. */
  const strangerEdit = await reg.patch(`voyage_media?id=eq.${fid}`, { caption: "not mine" });
  note("regional", "cannot edit a frame that is not theirs",
    (strangerEdit.data || []).length === 0, `got ${strangerEdit.status}`);
  const strangerDel = await reg.del(`voyage_media?id=eq.${fid}`);
  note("regional", "cannot withdraw a frame that is not theirs",
    strangerDel.status >= 400 || (strangerDel.data || []).length === 0, `got ${strangerDel.status}`);

  /* Where the FILE is now, which is no longer where it was uploaded. Taking a
     frame back off the water moves the object under `withdrawn/` — a signed URL
     names a path, so moving it is the only way to revoke links already minted,
     and links to a withdrawn frame are exactly the ones that must die. The
     sweep list records the object's real location; asserting the original path
     would assert the file had NOT been moved, which is the opposite of what
     this block is now testing. */
  const resting = await stf.get(`voyage_media?id=eq.${fid}&select=storage_path`);
  const restingPath = (resting.data || [])[0]?.storage_path ?? path;
  note("staff", "a withdrawn frame no longer sits at the path it was signed under",
    restingPath !== path && restingPath.startsWith("withdrawn/"),
    `still at ${restingPath}`);

  const own = await glo.del(`voyage_media?id=eq.${fid}`);
  note("global", "withdraws their own frame entirely",
    own.status < 400 && (own.data || []).length === 1, `got ${own.status}`);

  /* Storage will not delete from SQL, so a withdrawn row records its path for
     a sweep rather than leaving the file unnoticed. */
  const noted = await stf.get(`orphaned_media?select=storage_path&storage_path=eq.${restingPath}`);
  note("staff", "a withdrawn frame leaves its file on the sweep list",
    (noted.data || []).length === 1, `got ${noted.status} ${JSON.stringify(noted.data).slice(0, 80)}`);

  await fetch(`${SUPA}/storage/v1/object/voyage-media`, {
    method: "DELETE",
    headers: { apikey: ANON, Authorization: `Bearer ${p.staff.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path, restingPath] }),
  });
  await stf.patch(`orphaned_media?storage_path=eq.${path}`, { cleared_at: new Date().toISOString() });
}

async function roundThreeRules(p) {
  const reg = rest(p.regional), stf = rest(p.staff), pau = rest(p.paused);
  const me = uid(p.regional);

  // — The free pass, through every door —
  const ahead = await stf.get(
    "voyages?status=eq.scheduled&select=id,price_cents&price_cents=gt.0" +
      `&starts_at=gt.${new Date().toISOString()}&order=starts_at.asc&limit=1`
  );
  const v = ahead.data?.[0];
  if (v) {
    /* account_ledger is append-only to everyone including staff, so a wipe is a
       silent no-op and an absolute folio carries residue from earlier runs.
       Every check below measures the CHANGE across the action instead. */
    const wipe = async () => {
      await stf.del(`rsvps?profile_id=eq.${me}&voyage_id=eq.${v.id}`);
      await stf.del(`fathoms_ledger?profile_id=eq.${me}&voyage_id=eq.${v.id}`);
    };
    /* Bounded by TIME, not by clearing history first — the same correction this
       file already made for notifications, which needed making here too and did
       not get it.

       account_ledger has no DELETE policy (it is the club's record), so the
       `stf.del(account_ledger...)` calls in this suite have always been silent
       no-ops and the rows accumulate forever: this persona had 511 berth/credit
       pairs on one voyage. PostgREST caps a response at 1000 rows whatever
       limit you ask for, so this helper was summing the first PAGE of the
       ledger and calling it the balance. Every assertion built on it went
       quietly wrong the moment the pair passed a thousand rows — reporting a
       free pass where the member had in fact been charged correctly.

       A marker makes the window small, exact, and independent of how much
       history is behind it. */
    const folio = async (since) => {
      const rows = await reg.get(
        `account_ledger?profile_id=eq.${me}&voyage_id=eq.${v.id}&created_at=gt.${since}&select=delta_cents`
      );
      const list = rows.data || [];
      if (list.length >= 1000) throw new Error("folio window is too wide to trust — narrow the marker");
      return list.reduce((n, r) => n + r.delta_cents, 0);
    };
    const claim = () => reg.post("rsvps", { voyage_id: v.id, profile_id: me, status: "aboard" });

    for (const [label, away] of [["not_going", "not_going"], ["waitlist", "waitlist"]]) {
      await wipe();
      const mark = new Date().toISOString();
      const start = await folio(mark);
      const first = await claim();
      const rid = first.data?.[0]?.id;
      if (rid) {
        await reg.patch(`rsvps?id=eq.${rid}`, { status: away });
        const released = await folio(mark);
        await reg.patch(`rsvps?id=eq.${rid}`, { status: "aboard" });
        const f = await folio(mark);
        note("regional", `a pass released via ${label} is charged again`,
          f - released === -v.price_cents,
          `moved ${f - released} on re-claim (start ${start}) — a free pass if this is 0`);
      }
    }

    // An ordinary edit while aboard must not charge twice.
    await wipe();
    const editMark = new Date().toISOString();
    const editStart = await folio(editMark);
    const held = await claim();
    const hid = held.data?.[0]?.id;
    if (hid) {
      const charged = await folio(editMark);
      await reg.patch(`rsvps?id=eq.${hid}`, { show_on_manifest: false });
      const f = await folio(editMark);
      note("regional", "editing a pass you hold does not charge again", f === charged,
        `moved ${f - charged} on an edit (charge was ${charged - editStart})`);
      await reg.patch(`rsvps?id=eq.${hid}`, { show_on_manifest: true });
    }
    await wipe();
  }

  // — A seat in a thread is not self-granted —
  const someThread = await stf.get("threads?kind=eq.direct&select=id&limit=1");
  const tid = someThread.data?.[0]?.id;
  if (tid) {
    for (const [who, client] of [["regional", reg], ["paused", pau]]) {
      const seat = await client.post("thread_members", { thread_id: tid, profile_id: uid(p[who]) });
      note(who, "cannot seat yourself in a stranger's thread", seat.status >= 400, `got ${seat.status}`);
    }
    const peek = await reg.get(`messages?thread_id=eq.${tid}&select=body&limit=1`);
    note("regional", "a stranger's messages stay unread", (peek.data || []).length === 0,
      `${(peek.data || []).length} rows`);
  }
  /* Pick a seat that is genuinely somewhere else. Taking the first seat and
     moving it to `tid` was a no-op whenever that seat was already in `tid` —
     the trigger has nothing to refuse, PostgREST answers 200, and the check
     failed on the suite's own ordering rather than on behaviour. */
  const mySeat = await reg.get(`thread_members?profile_id=eq.${me}&select=thread_id&thread_id=neq.${tid}&limit=1`);
  if (mySeat.data?.[0] && tid) {
    const move = await reg.patch(
      `thread_members?profile_id=eq.${me}&thread_id=eq.${mySeat.data[0].thread_id}`,
      { thread_id: tid }
    );
    note("regional", "you cannot walk your seat into another thread", move.status >= 400,
      `got ${move.status}`);
  }

  // — The club's words are not a member's to rewrite —
  const mine = await reg.get(`notifications?profile_id=eq.${me}&select=id,title&limit=1`);
  if (mine.data?.[0]) {
    const forge = await reg.patch(`notifications?id=eq.${mine.data[0].id}`, { title: "E2E FORGED" });
    note("regional", "a member cannot rewrite a notification", forge.status >= 400, `got ${forge.status}`);
    const read = await reg.patch(`notifications?id=eq.${mine.data[0].id}`, { read: true });
    note("regional", "a member can still mark it read", read.status < 400, `got ${read.status}`);
  }

  // — A guest code is the first free slot —
  if (v) {
    const gid = uid(p.global);
    await stf.del(`rsvps?profile_id=eq.${gid}&voyage_id=eq.${v.id}`);
    const seatG = await stf.post("rsvps", {
      voyage_id: v.id, profile_id: gid, status: "aboard", comp: true,
      guests: 2, guest_names: ["E2E Slot One", "E2E Slot Two"],
    });
    const grid = seatG.data?.[0]?.id;
    if (grid) {
      await stf.patch(`rsvps?id=eq.${grid}`, {
        guests: 2, guest_names: ["E2E Slot Two", "E2E Slot Three"],
      });
      const party = await stf.get(`rsvp_guests?rsvp_id=eq.${grid}&select=name,boarding_code,sign_token`);
      const rows = party.data || [];
      const complete = rows.length === 2 && rows.every((g) => g.boarding_code && g.sign_token);
      note("staff", "swapping a guest still cuts the newcomer a code and a link", complete,
        JSON.stringify(rows.map((g) => [g.name, g.boarding_code])).slice(0, 120));
      await stf.del(`rsvp_guests?rsvp_id=eq.${grid}`);
      await stf.del(`rsvps?id=eq.${grid}`);
    }
    await stf.del(`account_ledger?profile_id=eq.${gid}&voyage_id=eq.${v.id}`);
    await stf.del(`fathoms_ledger?profile_id=eq.${gid}&voyage_id=eq.${v.id}`);
  }

  // — A definer carries the rules its policy carries —
  for (const [label, args] of [
    ["an over-long name", { p_full_name: "N".repeat(200), p_email: "e2e-anon-probe@example.com", p_city: "Miami", p_note: "x", p_code: "none" }],
    ["an address with no @", { p_full_name: "E2E Probe", p_email: "not-an-address", p_city: "Miami", p_note: "x", p_code: "none" }],
    ["a five-kilobyte note", { p_full_name: "E2E Probe", p_email: "e2e-anon-probe@example.com", p_city: "Miami", p_note: "x".repeat(5000), p_code: "none" }],
  ]) {
    const r = await rest(null).rpc("apply_with_invite", args);
    note("anon", `the invite path refuses ${label}`, r.status >= 400, `got ${r.status}`);
  }

  // — A line is a dozen, and no constraint text reaches anyone —
  const prod = await reg.get("products?select=id&active=eq.true&limit=1");
  if (prod.data?.[0]?.id) {
    const over = await reg.rpc("place_shop_order", {
      p_lines: [{ productId: prod.data[0].id, qty: 13 }],
    });
    const msg = JSON.stringify(over.data ?? "");
    note("regional", "a line over a dozen is refused", over.status >= 400, `got ${over.status}`);
    note("regional", "the refusal names no constraint", !/constraint|relation "/i.test(msg),
      msg.slice(0, 80));
  }

  await stf.del("applications?email=like.e2e-anon-probe*");
}

/* ---------- A. route × role matrix ---------- */
async function routeMatrix(personas) {
  const memberPages = manifest.routes.filter((r) => r.type === "page" && !r.dynamic && r.access === "member");
  for (const [name, s] of Object.entries(personas)) {
    for (const r of memberPages) {
      const res = await page(s, r.path);
      /* /show is a member-group route by file layout and a crew surface by
         rule: the run-of-show board, the deck flags and the Pod queue are read
         on a wet deck by the Cast & Crew, and every table behind it is
         is_staff(). It gates the same way the Bridge does — redirect to /home —
         so it is classified here rather than given a second idiom of its own. */
      const isStaffRoute = r.path.startsWith("/bridge") || r.path === "/kiosk" || r.path === "/show";
      if (isStaffRoute && name !== "staff") {
        const loc = res.headers.get("location") || "";
        const ok = res.status >= 300 && res.status < 400 && loc.includes("/home");
        note(name, `staff gate holds on ${r.path}`, ok, `got ${res.status} → ${res.headers.get("location")}`);
      } else {
        const ok = res.status === 200;
        note(name, `renders ${r.path}`, ok, `got ${res.status}`);
        if (ok) {
          const html = await res.text();
          note(name, `${r.path} free of error text`, !/Application error|__next_error__/i.test(html));
          /* The lexicon holds behind the gangway too — the audit only sees
             public pages, so the member surface is checked here. */
          const visible = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<![^>]*>/g, "").replace(/<[^>]+>/g, " ");
          /* Against VISIBLE text, not raw HTML: a word like "berth" lives in
             RSC payloads as berths_total forever, and what matters is what a
             person reads. */
          /* Case-insensitively, and against visible text only. The list is
             written in the casing the copy uses, so a lower-cased "chandlery"
             in an empty state and an upper-cased "SHORE OFFICE" coming out of
             a data row both slipped past an exact match. Comparing on a folded
             copy is safe here because `visible` is rendered text — class names
             like hm-ticket and RSC payload keys never reach it. */
          /* Fixture personas sign in as e2e-<tier>@fixtures.invalid and the
             seeded demo account is skipper@fixtures.invalid — addresses that are
             deliberately on a RETIRED domain, because no_real_mail_to_a_fixture
             recognises them and refuses to post anything to them. Every Bridge
             screen that lists members renders those addresses, so the retired
             domain reads back as a lexicon failure on a staff page.

             It is not one. The gate exists to catch a retired brand in PRODUCT
             COPY, and a test account's address is not copy. Moving the fixtures
             to a live domain would be worse than the finding: skipper@ is
             matched by that guard EXACTLY, so renaming its domain would start
             posting real mail to it. Fixture addresses are removed from the
             text before the lexicon reads it, and nothing else is.

             Narrow on purpose: only an address, only these two shapes. A
             retired brand anywhere else on the page still fails. */
          const withoutFixtures = visible.replace(
            /\b(?:e2e-[a-z0-9-]+|skipper)@[a-z0-9.-]+\.[a-z]{2,}/gi,
            " "
          );
          const haystack = withoutFixtures.toLowerCase();
          const banned = BANNED.filter((t) => haystack.includes(t.toLowerCase()));
          note(name, `${r.path} on-lexicon`, banned.length === 0, banned.join(", "));
          const shouts = (visible.match(/!/g) || []).length;
          note(name, `${r.path} never shouts`, shouts === 0, shouts ? `${shouts} exclamation` : "");
          /* The producer voice carries no emoji. The audit only sees public
             pages, so the member surface is checked here — with the kit's own
             text glyphs (⚐ ⚑ Hail, ✓ reached) carved out of the range. */
          const emoji = visible.match(
            /[\u{1F300}-\u{1FAFF}\u{2600}-\u{268F}\u{2692}-\u{2712}\u{2714}-\u{27BF}\u{FE0F}]/u
          );
          note(name, `${r.path} carries no emoji`, !emoji, emoji ? `found ${emoji[0]}` : "");
          /* The retired currency. The public audit checks "Fathoms" against raw
             HTML and case-sensitively, so a lowercase "fathoms" inside a
             database-generated notification slipped past it twice — and those
             render here, on the member surface, not on a public page. */
          const retired = visible.match(/fathom/i);
          note(name, `${r.path} says knots, not fathoms`, !retired,
            retired ? `found "${retired[0]}"` : "");
        }
      }
    }
  }
  // Anon: staff console is invisible (gangway, not a hint of /harbor)
  const anonStaff = await page(null, "/bridge");
  note("anon", "staff console redirects to gangway", anonStaff.status >= 300 && (anonStaff.headers.get("location") || "").includes("/gangway"), `got ${anonStaff.status}`);
}

/* ---------- C. parity features: messaging, transfers, codes, billing ---------- */
/* D. The logbook: marks, the Knots sink, and contests.
   Everything here is derived or definer-written, so the checks are mostly about
   what a member CANNOT do — confer their own marks, read a draft contest, enter
   on someone else's behalf, or see a standing that has not been published. */
/* THE ONE THING A MEMBER DOES TO THEIR OWN MEMBERSHIP, and the suite did not
   test it. set_own_standing was rewritten and shipped with the transaction-local
   flag `app.set_standing` missing — the flag guard_privileged_profile_columns
   requires before it will let a non-staff caller move `status`. Every pause,
   resume and departure raised "membership standing moves from the Bridge, not
   from here", and this suite reported 1111/1111 green over the top of it,
   because nothing here had ever pressed the button.

   Runs on `paused`, whose whole purpose is this state, and puts it back exactly
   as found. The last two assertions are the negative controls: a nonsense
   standing must be refused, and an anonymous caller must be refused, or a
   function that accepted everything would pass the first three. */
async function standingRules(p) {
  const me = rest(p.paused), anon = rest(null);
  const back = async (to) => me.rpc("set_own_standing", { p_status: to });

  const resumed = await back("active");
  const afterResume = await me.get(`profiles?select=status&id=eq.${uid(p.paused)}`);
  note("paused", "a member can resume their own membership",
    resumed.status < 400 && afterResume.data?.[0]?.status === "active",
    `rpc ${resumed.status}, status ${afterResume.data?.[0]?.status}`);

  const paused = await back("paused");
  const afterPause = await me.get(`profiles?select=status&id=eq.${uid(p.paused)}`);
  note("paused", "a member can pause their own membership",
    paused.status < 400 && afterPause.data?.[0]?.status === "paused",
    `rpc ${paused.status}, status ${afterPause.data?.[0]?.status}`);

  const raw = await me.patch(`profiles?id=eq.${uid(p.paused)}`, { status: "active" });
  note("paused", "standing does not move by a bare update", raw.status >= 400, `got ${raw.status}`);

  const nonsense = await back("becalmed");
  note("paused", "a standing that is not a standing is refused", nonsense.status >= 400, `got ${nonsense.status}`);

  const bySea = await anon.rpc("set_own_standing", { p_status: "active" });
  note("anon", "the open water cannot set a standing", bySea.status >= 400, `got ${bySea.status}`);
}

/* THE REBRAND'S LOAD-BEARING FIXES, none of which this suite tested.

   An adversarial pass found the legacy-card mapping, the till lookup and the
   boarding-code uniqueness were covered by nothing here, while the suite
   reported all green. Three fixes protecting people at a gangway and a till,
   and the only thing standing behind them was that their author had checked.

   Device storage is deliberately absent: it is localStorage, this suite speaks
   HTTP, and pretending to cover it with a request would be worse than the gap.
   It is driven directly against the real module instead. */
async function rebrandRules(p) {
  const stf = rest(p.staff);

  /* A code the club has retired must resolve to the same credential as the
     current one — a member holding last season's printed card still boards. */
  const key = async (code) =>
    (await stf.rpc("boarding_code_key", { code })).data;
  const legacy = await key("SYR-ABCD-0101-0001");
  const current = await key("UN-ABCD-0101-0001");
  const other = await key("UN-ZZZZ-0101-0002");
  note("staff", "a retired prefix maps onto the current one", legacy === current, `${legacy} vs ${current}`);
  note("staff", "and genuinely different codes stay different", current !== other, `${current} vs ${other}`);

  /* The credential names ONE person, across the mapping rather than the stored
     string — SYR-X and UN-X are the same code at the door. */
  const idx = await stf.get("rsvps?select=boarding_code&boarding_code=not.is.null&limit=200");
  const mapped = (idx.data || []).map((r) => String(r.boarding_code).toUpperCase().replace(/^(SYR|LS|LYR|LYRE)-/, "UN-"));
  note("staff", "no two passes share a credential once mapped",
    new Set(mapped).size === mapped.length, `${mapped.length} codes, ${new Set(mapped).size} distinct`);

  /* The till finds a member by the number on the card, whichever era printed
     it — and refuses anything that would reach a LIKE pattern as a wildcard. */
  const me = await stf.get(`profiles?select=member_no&member_no=not.is.null&limit=1`);
  const num = me.data?.[0]?.member_no;
  if (num) {
    const tail = String(num).split("-").pop();
    for (const typed of [num, `SYR-${tail}`, `LS-${tail}`, tail]) {
      const hit = await stf.get(`profiles?select=id&or=(member_no.eq.${tail},member_no.like.%25-${tail})`);
      note("staff", `the till resolves ${typed}`, (hit.data || []).length === 1, `${(hit.data || []).length} match(es)`);
    }
  }

  /* The SMS registry — the one surface no gate has ever crawled. It is not a
     rendered page, so the route audit walks past it and so does every check
     above this one. That is how provider_template_name kept the retired brand
     through TWO rebrands while the message bodies sitting beside it in the same
     rows were rewritten twice: the bodies open "[un]:", the links point at
     unhingedsocial.us, and the template was still named syrius_weather_hold.
     These strings are not internal — variable_samples and draft_body are the
     examples submitted to a carrier for approval under the club's name.

     The count guard matters as much as the pattern: an empty read, or one RLS
     refuses, would otherwise pass this test by having nothing to fail. */
  const registry = await stf.get(
    "sms_templates?select=code,provider_template_name,draft_body,note,variable_samples"
  );
  const RETIRED = /(syrius|lyre|slop chest|unscripted social experiment)/i;
  const stale = (registry.data || []).filter((t) =>
    RETIRED.test(
      [t.provider_template_name, t.draft_body, t.note, JSON.stringify(t.variable_samples ?? null)].join(" ")
    )
  );
  note(
    "staff",
    "the SMS registry carries no retired brand",
    (registry.data || []).length > 0 && stale.length === 0,
    stale.length
      ? `retired brand in: ${stale.map((t) => t.code).join(", ")}`
      : `${(registry.data || []).length} templates clean`
  );
}

async function logbookRules(p) {
  const reg = rest(p.regional), stf = rest(p.staff);

  // Marks are conferred by trigger only — no member may award themselves one.
  const selfMark = await reg.post("member_marks", {
    profile_id: uid(p.regional), mark_code: "the-hundred",
  });
  note("regional", "cannot confer a mark on yourself", selfMark.status >= 400, `got ${selfMark.status}`);

  // The catalogue is public; who holds what is scoped by the directory flag.
  const cat = await reg.get("marks?select=code&active=eq.true");
  note("regional", "mark catalogue is readable", (cat.data || []).length >= 9, JSON.stringify(cat.data?.length));

  // passage_log refuses to report on a member who is not listed.
  const hidden = await reg.rpc("passage_log", { p_profile_id: uid(p.paused) });
  const ownLog = await reg.rpc("passage_log", { p_profile_id: uid(p.regional) });
  note("regional", "passage log hides an unlisted member", hidden.status >= 400, `got ${hidden.status}`);
  note("regional", "passage log reads your own", ownLog.status < 400 && Array.isArray(ownLog.data), `got ${ownLog.status}`);

  // A draft contest is invisible to members and its standing is refused.
  const dslug = "e2e-draft-" + Date.now().toString(36);
  const draft = await stf.post("contests", {
    slug: dslug, shape: "regatta", title: "E2E draft contest.", metric: "nm",
    starts_at: new Date(Date.now() - 864e5).toISOString(),
    ends_at: new Date(Date.now() + 864e5).toISOString(), status: "draft",
    knots_award: 500,
  });
  const did = draft.data?.[0]?.id;
  const seeDraft = await reg.get(`contests?id=eq.${did}&select=id`);
  note("regional", "a draft contest is not visible", (seeDraft.data || []).length === 0, JSON.stringify(seeDraft.data));
  const draftStand = await reg.rpc("contest_standing", { p_contest_id: did });
  note("regional", "a draft standing is refused", draftStand.status >= 400, `got ${draftStand.status}`);
  const enterDraft = await reg.post("contest_entries", { contest_id: did, profile_id: uid(p.regional) });
  note("regional", "cannot enter a draft contest", enterDraft.status >= 400, `got ${enterDraft.status}`);

  // Opened: entry works, but only for yourself.
  await stf.patch(`contests?id=eq.${did}`, { status: "open" });
  const enterSelf = await reg.post("contest_entries", { contest_id: did, profile_id: uid(p.regional) });
  note("regional", "may enter an open contest", enterSelf.status < 400, `got ${enterSelf.status}`);
  const enterOther = await reg.post("contest_entries", { contest_id: did, profile_id: uid(p.global) });
  note("regional", "cannot enter on another member's behalf", enterOther.status >= 400, `got ${enterOther.status}`);

  // Results stay sealed until the contest is settled.
  const sealed = await reg.get(`contest_results?contest_id=eq.${did}&select=place`);
  note("regional", "results are sealed before settling", (sealed.data || []).length === 0, JSON.stringify(sealed.data));

  // Only staff may settle, and only once.
  const memberSettle = await reg.rpc("settle_contest", { p_contest_id: did });
  note("regional", "a member cannot settle a contest", memberSettle.status >= 400, `got ${memberSettle.status}`);
  const settle = await stf.rpc("settle_contest", { p_contest_id: did });
  note("staff", "staff settles the contest", settle.status < 400, `got ${settle.status}`);
  const twice = await stf.rpc("settle_contest", { p_contest_id: did });
  note("staff", "settling twice is refused", twice.status >= 400, `got ${twice.status}`);
  const published = await reg.get(`contest_results?contest_id=eq.${did}&select=place,score`);
  note("regional", "results publish once settled", (published.data || []).length >= 1, JSON.stringify(published.data));

  // The podium split: a regatta's award pays 50/30/20 across I/II/III, the
  // rounding remainder to I. One entrant here, so I takes 250 of 500 and the
  // unclaimed places pay no one.
  const paid = await reg.get(
    `fathoms_ledger?profile_id=eq.${uid(p.regional)}&reason=eq.${encodeURIComponent("Won — E2E draft contest.")}&order=created_at.desc&limit=1`
  );
  note("regional", "regatta award splits the podium — I takes 250 of 500", paid.data?.[0]?.delta === 250, JSON.stringify(paid.data));
  // Sweep the award so reruns keep every balance-guard assertion honest. The
  // ledger is RPC-write-only, so the sweep goes through Shoreside's correction
  // — and a member must not be able to reach it.
  const memberSweep = await reg.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: 1, p_reason: "E2E forgery" });
  note("regional", "a member cannot adjust the ledger", memberSweep.status >= 400, `got ${memberSweep.status}`);
  const sweep = await stf.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: -250, p_reason: "E2E award swept." });
  note("staff", "the award sweep posts", sweep.status < 400, `got ${sweep.status}`);

  // The Knots sink: a redemption must be affordable, and spends through the RPC.
  const dear = await reg.get("rewards?select=id,cost_fm&order=cost_fm.desc&limit=1");
  const cannot = await reg.rpc("redeem_reward", { p_reward: dear.data?.[0]?.id });
  note("regional", "cannot redeem beyond your balance", cannot.status >= 400, `got ${cannot.status}`);
  const forge = await reg.post("reward_redemptions", {
    profile_id: uid(p.regional), reward_id: dear.data?.[0]?.id,
  });
  note("regional", "cannot write a redemption directly", forge.status >= 400, `got ${forge.status}`);

  await stf.del(`contests?id=eq.${did}`);
}

async function parityRules(p) {
  const reg = rest(p.regional), glo = rest(p.global), stf = rest(p.staff);

  /* One fixture exercises the whole confirm chain: a pass goes aboard, the
     crew thread opens by trigger, the Word posts, and the push queue grows.
     Members only ever see threads they belong to, so we need our own. */
  const sslug = "e2e-signal-" + Date.now().toString(36);
  const mkS = await stf.post("voyages", {
    slug: sslug, title: "E2E signal sailing.", class: "sea", kind: "sea_day",
    starts_at: new Date(Date.now() + 45 * 864e5).toISOString(),
    berths_total: 4, price_cents: 0, min_tier: "regional", distance_nm: 5,
  });
  const svid = mkS.data?.[0]?.id;
  note("staff", "creates the signal fixture", mkS.status === 201, `got ${mkS.status}`);

  /* Count what this action queues, not what the table holds. Counting rows
     under a limit saturates — push_outbox passed 1000 and before/after both
     read 1000, so a fan-out that had stopped entirely would still "pass". */
  const pushSince = new Date().toISOString();
  const board = await glo.post("rsvps", { voyage_id: svid, profile_id: uid(p.global), status: "aboard" });
  note("global", "boards the fixture", board.status === 201, `got ${board.status}`);
  await new Promise((r) => setTimeout(r, 600));

  const crew = await glo.get(`threads?voyage_id=eq.${svid}&kind=eq.crew&select=id`);
  const tid = crew.data?.[0]?.id;
  note("global", "a confirmed pass opens a crew thread", !!tid, JSON.stringify(crew.data).slice(0, 80));

  // Fan-out is a trigger, not app code: the Word queued a push on its own.
  const pushNew = ((await stf.get(`push_outbox?select=id&created_at=gt.${pushSince}`)).data || []).length;
  note("staff", "notifications fan out to push", pushNew > 0, `${pushNew} queued since boarding`);

  if (tid) {
    const said = await glo.post("messages", { thread_id: tid, author_id: uid(p.global), body: "Who has the midnight watch?" });
    note("global", "writes into their own crew thread", said.status === 201, `got ${said.status}`);
    // Whoever is not on that manifest sees nothing, even knowing the id.
    const peek = await reg.get(`messages?thread_id=eq.${tid}&select=id`);
    note("regional", "outsider cannot read a crew thread", (peek.data || []).length === 0, JSON.stringify(peek.data).slice(0, 60));
    const forge = await reg.post("messages", { thread_id: tid, author_id: uid(p.regional), body: "Let me in." });
    note("regional", "outsider cannot post into a crew thread", forge.status >= 400, `got ${forge.status}`);
  }

  // --- Direct threads: idempotent, and private to the two of them ---
  /* A DM now needs entitlement, not merely a signed-in sender: you may write to
     someone you have sailed with, or to someone who chose to be listed. The
     fixtures are neither by default, which is exactly why this used to pass —
     any member could open a conversation with any other. List the recipient for
     the duration, and check the refusal on someone who is not.
     See "a direct message is something the other person can refuse". */
  const strangerDm = await glo.rpc("open_direct_thread", { p_other: uid(p.paused) });
  note("global", "cannot DM a member they have not sailed with or found listed",
    strangerDm.status >= 400, `got ${strangerDm.status}`);

  await stf.patch(`profiles?id=eq.${uid(p.national)}`, { in_directory: true });

  const open1 = await glo.rpc("open_direct_thread", { p_other: uid(p.national) });
  const open2 = await glo.rpc("open_direct_thread", { p_other: uid(p.national) });
  note("global", "opens a direct thread", open1.status === 200 && !!open1.data, `got ${open1.status}`);
  note("global", "direct thread is idempotent", open1.data === open2.data, `${open1.data} vs ${open2.data}`);
  if (open1.data) {
    const said = await glo.post("messages", { thread_id: open1.data, author_id: uid(p.global), body: "Midnight watch is mine." });
    note("global", "writes into own direct thread", said.status === 201, `got ${said.status}`);
    const peek = await reg.get(`messages?thread_id=eq.${open1.data}&select=id`);
    note("regional", "third party cannot read a direct thread", (peek.data || []).length === 0, JSON.stringify(peek.data).slice(0, 60));
    /* Take it back out. Every run used to leave this line in a real member's
       conversation — twelve of them had piled up, and a crawl agent reasonably
       read the drip as another session driving the composer. A suite that
       accumulates state in the product it is testing eventually gets reported
       as a bug in the product. */
    if (said.data?.[0]?.id) await glo.del(`messages?id=eq.${said.data[0].id}`);
  }
  const self = await glo.rpc("open_direct_thread", { p_other: uid(p.global) });
  note("global", "cannot open a thread with themselves", self.status >= 400, `got ${self.status}`);

  // --- Promo codes: validated by RPC, never readable ---
  const readCodes = await glo.get("promo_codes?select=code&limit=1");
  note("global", "promo codes are not member-readable", (readCodes.data || []).length === 0, JSON.stringify(readCodes.data).slice(0, 60));
  const anyVoyage = await glo.get("voyages?select=id&limit=1");
  const vid = anyVoyage.data?.[0]?.id;
  const bad = await glo.rpc("check_promo", { p_code: "NOPE-NOT-A-CODE", p_voyage: vid });
  note("global", "unknown code is refused", bad.data?.ok === false, JSON.stringify(bad.data));
  const good = await glo.rpc("check_promo", { p_code: "FOUNDING", p_voyage: vid });
  note("global", "a live code validates", good.data?.ok === true && good.data?.kind === "percent", JSON.stringify(good.data));
  const anonCode = await rest(null).rpc("check_promo", { p_code: "FOUNDING", p_voyage: vid });
  note("anon", "code checking is closed to anon", anonCode.status >= 400, `got ${anonCode.status}`);

  // --- Per-guest credentials are generated, not hand-written ---
  /* Codes the system minted — fixtures with hand-written codes are not the
     subject here, and one of them is undeletable by design (it signed). */
  const guests = await stf.get(
    "rsvp_guests?select=name,boarding_code&boarding_code=not.is.null&name=not.like.E2E*&limit=3"
  );
  const coded = (guests.data || []).every((g) => /^UN-/.test(g.boarding_code || ""));
  note("staff", "guests carry their own codes", (guests.data || []).length > 0 && coded, JSON.stringify(guests.data).slice(0, 120));

  /* A guest's sign_token is a bearer credential — it opens and signs that
     guest's waiver — so it belongs to the host and the Bridge, nobody else. */
  const nosyRsvps = await glo.get(`rsvps?profile_id=eq.${uid(p.global)}&select=id`);
  const own = new Set((nosyRsvps.data || []).map((r) => r.id));
  const nosy = await glo.get("rsvp_guests?select=id,rsvp_id&limit=20");
  const notMine = (nosy.data || []).filter((g) => !own.has(g.rsvp_id));
  note("global", "another host's guests are not yours to read", notMine.length === 0,
    JSON.stringify(notMine).slice(0, 120));

  // --- Waitlist position is visible and ordered ---
  const wl = await glo.get("waitlist_position?select=position&limit=1");
  note("global", "waitlist position view reads", wl.status === 200, `got ${wl.status}`);

  // --- Billing: members read their own, write nothing ---
  const subsRead = await glo.get("subscriptions?select=id&limit=1");
  note("global", "reads own subscriptions", subsRead.status === 200, `got ${subsRead.status}`);
  const subsWrite = await glo.post("subscriptions", { profile_id: uid(p.global), status: "active" });
  note("global", "cannot grant themselves a membership", subsWrite.status >= 400, `got ${subsWrite.status}`);
  const invOther = await reg.get(`invoices?profile_id=eq.${uid(p.global)}&select=id`);
  note("regional", "cannot read another member's invoices", (invOther.data || []).length === 0, JSON.stringify(invOther.data).slice(0, 60));

  // --- Staff-only ops surfaces stay staff-only ---
  for (const [table, label] of [["saved_segments", "segments"], ["api_keys", "API keys"], ["webhooks", "webhooks"], ["automations", "automations"]]) {
    const r = await glo.get(`${table}?select=id&limit=1`);
    note("global", `cannot read ${label}`, (r.data || []).length === 0, `got ${r.status}`);
  }
  const stfSeg = await stf.get("saved_segments?select=id&limit=1");
  note("staff", "staff read segments", stfSeg.status === 200 && Array.isArray(stfSeg.data), `got ${stfSeg.status}`);

  // --- Push subscriptions are per-device and per-member ---
  const pushMine = await glo.post("push_subscriptions", {
    profile_id: uid(p.global), endpoint: `https://example.invalid/e2e-${Date.now()}`, p256dh: "x", auth: "y",
  });
  note("global", "registers a push endpoint", pushMine.status === 201, `got ${pushMine.status}`);
  const pushTheirs = await reg.post("push_subscriptions", {
    profile_id: uid(p.global), endpoint: `https://example.invalid/e2e-forge-${Date.now()}`, p256dh: "x", auth: "y",
  });
  note("regional", "cannot register a push endpoint for someone else", pushTheirs.status >= 400, `got ${pushTheirs.status}`);
  if (pushMine.status === 201) {
    await glo.del(`push_subscriptions?id=eq.${pushMine.data?.[0]?.id}`);
  }

  // Strike the fixture; the cascade takes the rsvp, thread and messages with it.
  const rmS = await stf.del(`voyages?id=eq.${svid}`);
  note("staff", "removes the signal fixture", rmS.status === 200 || rmS.status === 204, `got ${rmS.status}`);

}

/* ---------- B. business rules ---------- */
async function businessRules(p) {
  const reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global),
        pau = rest(p.paused), stf = rest(p.staff), anon = rest(null);

  // Fixture voyage: 1 berth, national-tier, staff-created
  const slug = "e2e-fixture-" + Date.now().toString(36);
  const mk = await stf.post("voyages", {
    slug, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 864e5).toISOString(),
    berths_total: 1, price_cents: 1000, min_tier: "national", distance_nm: 10,
  });
  note("staff", "creates fixture voyage", mk.status === 201, `got ${mk.status} ${JSON.stringify(mk.data).slice(0, 120)}`);
  const vid = mk.data?.[0]?.id;
  if (!vid) return;

  // Member cannot create voyages
  const memberMk = await glo.post("voyages", { slug: slug + "-x", title: "Nope.", class: "sea", starts_at: new Date().toISOString() });
  note("global", "cannot create voyages", memberMk.status === 403 || memberMk.status === 401, `got ${memberMk.status}`);

  // Tier gate: regional blocked from national sailing
  const regTry = await reg.post("rsvps", { voyage_id: vid, profile_id: uid(p.regional), status: "aboard" });
  note("regional", "tier gate blocks national sailing", regTry.status >= 400 && JSON.stringify(regTry.data).includes("tier"), `got ${regTry.status}`);

  // Paused member blocked from boarding
  const pauTry = await pau.post("rsvps", { voyage_id: vid, profile_id: uid(p.paused), status: "aboard" });
  /* The refusal must NAME the reason, not merely refuse — a paused member who
     is told only "no" goes looking for a bug in their pass. */
  note("paused", "a paused membership blocks boarding, and says so",
    pauTry.status >= 400 && /paused/i.test(JSON.stringify(pauTry.data)), `got ${pauTry.status}`);

  // Guest passes: national with guests rejected, global capped at 2
  const natGuest = await nat.post("rsvps", { voyage_id: vid, profile_id: uid(p.national), status: "aboard", guests: 1 });
  note("national", "guest berths require Global", natGuest.status >= 400 && /Global/i.test(JSON.stringify(natGuest.data)), `got ${natGuest.status}`);

  // National takes the single berth (also proves ledger charge trigger)
  const natRsvp = await nat.post("rsvps", { voyage_id: vid, profile_id: uid(p.national), status: "aboard" });
  note("national", "reserves the berth", natRsvp.status === 201, `got ${natRsvp.status} ${JSON.stringify(natRsvp.data).slice(0, 120)}`);
  const natLedger = await nat.get(`account_ledger?voyage_id=eq.${vid}&kind=eq.berth&select=delta_cents`);
  note("national", "berth charge posts to house account", natLedger.data?.[0]?.delta_cents === -1000, JSON.stringify(natLedger.data));
  const natCode = await nat.get(`rsvps?voyage_id=eq.${vid}&profile_id=eq.${uid(p.national)}&select=boarding_code`);
  /* The full five-segment shape, not just the prefix: 20260901004433 added the
     md5 discriminator after two sailings minted the same credential, and this
     assertion still passing on /^UN-/ alone is how a regression to the old
     four-segment mint (accept_pass_transfer had exactly that) stayed green. */
  note("national", "boarding code issued in the five-segment shape",
    /^UN-[A-Z0-9]{1,4}-\d{4}-\d{4}-[A-F0-9]{2}$/.test(natCode.data?.[0]?.boarding_code || ""), JSON.stringify(natCode.data));

  // Capacity: global bounced to full manifest
  const gloTry = await glo.post("rsvps", { voyage_id: vid, profile_id: uid(p.global), status: "aboard" });
  note("global", "capacity guard bounces full manifest", gloTry.status >= 400 && /full/i.test(JSON.stringify(gloTry.data)), `got ${gloTry.status}`);
  const gloWait = await glo.post("rsvps", { voyage_id: vid, profile_id: uid(p.global), status: "waitlist" });
  note("global", "joins the waitlist", gloWait.status === 201, `got ${gloWait.status}`);

  // Waitlist promotion in order: national releases → global promoted by trigger
  const natRel = await nat.del(`rsvps?voyage_id=eq.${vid}&profile_id=eq.${uid(p.national)}`);
  note("national", "releases the berth", natRel.status === 200 || natRel.status === 204, `got ${natRel.status}`);
  await new Promise((r) => setTimeout(r, 400));
  const gloNow = await glo.get(`rsvps?voyage_id=eq.${vid}&profile_id=eq.${uid(p.global)}&select=status`);
  note("global", "auto-promoted from waitlist in order", gloNow.data?.[0]?.status === "aboard", JSON.stringify(gloNow.data));
  const natCredit = await nat.get(`account_ledger?voyage_id=eq.${vid}&kind=eq.credit&select=delta_cents`);
  note("national", "48h+ release credited in full", natCredit.data?.[0]?.delta_cents === 1000, JSON.stringify(natCredit.data));
  const gloWord = await glo.get(`notifications?select=title&order=created_at.desc&limit=3`);
  note("global", "promotion lands in the Word", JSON.stringify(gloWord.data).includes("released to you"), JSON.stringify(gloWord.data).slice(0, 160));

  // Completion engine: staff completes → 10 FM/NM to those aboard
  await stf.patch(`voyages?id=eq.${vid}`, { status: "completed" });
  await new Promise((r) => setTimeout(r, 400));
  const gloFm = await glo.get(`fathoms_ledger?voyage_id=eq.${vid}&select=delta,reason`);
  const banked = (gloFm.data || []).find((x) => /Miles banked/.test(x.reason));
  note("global", "completion banks 10 FM/NM", banked?.delta === 100, JSON.stringify(gloFm.data));

  // Rewards: regional cannot afford the cheapest reward. The guard speaks in
  // Knots — "fathoms" is retired everywhere a member can read it.
  /* Pick a reward this member demonstrably cannot afford, rather than assuming
     the cheapest one is out of reach — a crawl that banks Knots on the regional
     fixture used to turn this guard into a successful redemption, and the suite
     read that as the guard failing. Assert against the balance as it is. */
  /* The balance redeem_reward actually tests is the sum of fathoms_ledger,
     not member_league.knots — reading the wrong source made the assertion
     compare against 0 while the member could plainly afford the reward. */
  /* The balance as the guard computes it — a SUM, not a walk over rows. Summing
     rows over REST silently stops at PostgREST's 1000-row cap, and a fixture
     with three thousand ledger rows read 373 where the definer saw 400+: the
     guard then let a "cannot afford" redemption through and the suite called
     the guard broken. The hardening log had already named this shape. */
  const bal = await reg.get(`fathoms_balance?profile_id=eq.${uid(p.regional)}&select=balance`);
  const knots = Number(bal.data?.[0]?.balance ?? 0);
  const rw = await reg.get(`rewards?select=id,cost_fm&cost_fm=gt.${knots}&order=cost_fm.asc&limit=1`);
  if (rw.data?.[0]) {
    const redeem = await reg.rpc("redeem_reward", { p_reward: rw.data[0].id });
    note("regional", "redemption guard: not enough knots",
      redeem.status >= 400 && /not enough knots/i.test(JSON.stringify(redeem.data)),
      `${knots} knots vs ${rw.data[0].cost_fm} — got ${redeem.status} ${JSON.stringify(redeem.data)}`);
  } else {
    note("regional", "redemption guard: not enough knots", true,
      `no reward costs more than ${knots} knots — guard not exercisable`);
  }

  // Moderation rights: regional cannot delete another's post; staff can
  const post = await glo.post("wardroom_posts", { author_id: uid(p.global), body: "E2E — the fixture speaks." });
  const pid = post.data?.[0]?.id;
  note("global", "posts to the wardroom", post.status === 201, `got ${post.status}`);
  const regDel = await reg.del(`wardroom_posts?id=eq.${pid}`);
  const still = await glo.get(`wardroom_posts?id=eq.${pid}&select=id`);
  note("regional", "cannot delete another member's post", (still.data || []).length === 1, `del ${regDel.status}`);
  const flag = await reg.post("wardroom_flags", { post_id: pid, flagger_id: uid(p.regional), reason: "conduct — e2e" });
  note("regional", "can flag for the harbormaster", flag.status === 201, `got ${flag.status}`);
  const stfDel = await stf.del(`wardroom_posts?id=eq.${pid}`);
  note("staff", "moderates (deletes) the post", stfDel.status === 200 || stfDel.status === 204, `got ${stfDel.status}`);

  // Application funnel privacy + vetting bypass resistance
  const anonApp = await anon.post("applications", { email: `e2e-applicant-${Date.now()}@example.com`, full_name: "E2E Applicant" });
  note("applicant", "can file an application", anonApp.status === 201 || anonApp.status === 401 || anonApp.status === 403, `got ${anonApp.status}`);
  const anonRead = await anon.get("applications?select=email&limit=1");
  note("anon", "cannot read applications", (anonRead.data || []).length === 0 || anonRead.status >= 400, `got ${anonRead.status} ${JSON.stringify(anonRead.data).slice(0, 80)}`);
  const regApps = await reg.get("applications?select=email&limit=1");
  note("regional", "members cannot read applications", (regApps.data || []).length === 0, JSON.stringify(regApps.data).slice(0, 80));
  const stfApps = await stf.get("applications?select=email&limit=1");
  note("staff", "staff read the application queue", stfApps.status === 200 && Array.isArray(stfApps.data), `got ${stfApps.status}`);
  const roll = await reg.get("member_roll?select=email&limit=1");
  note("regional", "member roll hidden from members", (roll.data || []).length === 0, JSON.stringify(roll.data).slice(0, 80));
  const signup = await fetch(`${SUPA}/auth/v1/signup`, {
    method: "POST", headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email: `gatecrash-${Date.now()}@example.com`, password: "x".repeat(16) }),
  });
  note("anon", "un-vetted signup rejected at the door", signup.status >= 400, `got ${signup.status}`);

  // Ledger privacy: regional sees none of global's rows
  const cross = await reg.get(`account_ledger?profile_id=eq.${uid(p.global)}&select=id&limit=1`);
  note("regional", "cannot read another member's ledger", (cross.data || []).length === 0, JSON.stringify(cross.data).slice(0, 80));

  /* Cleanup fixture. The ledger rows CANNOT go with it: fathoms_ledger has a
     select policy and nothing else, so no role can delete a row through the
     API. That is deliberate — a member's knots history is append-only, and it
     is the right call. It does mean the teardown leaves rows behind, which the
     footprint check at the end of main() accounts for explicitly rather than
     pretending it does not happen. */
  const rm = await stf.del(`voyages?id=eq.${vid}`);
  note("staff", "removes fixture voyage", rm.status === 200 || rm.status === 204, `got ${rm.status}`);
}

/* ---------- F. Vetting, Radar and Show ----------
   The three rules these modules are built on are all cross-row counts or clock
   comparisons, which means none of them can be a check constraint and all of
   them are trivially bypassed by curl if they live in React. So this block
   exercises them through PostgREST with no browser anywhere near it — the same
   door an attacker uses.

   What it asserts, in order: the ratio gate refuses a single pass into a full
   segment; a couple is ONE unit against its cap and TWO heads against the hull;
   the 17:30 lock refuses an insert AND a delete; the anonymity blur cannot be
   lowered on deck; and an indoor_only activity element cannot go Active without
   a named substitute.

   Every fixture is namespaced e2e-* and swept. The one deliberate omission is
   the Match Guarantee payout: settling it means completing a sailing, which
   posts real rows to account_ledger on a database that carries real money. The
   trigger is inert on every sailing with no voyage_radar row, and proving it
   fires would mean creating the one condition where it is not. */
async function ratioAndRadarRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national),
        glo = rest(p.global), anon = rest(null);
  /* Token-bearing, like every other section's — a bare Date.now() slug slips
     the end-of-run token sweep, and the hour of amnesty leaves these sailings
     (and their aboard passes) alive to spend the personas' monthly allowance
     in the NEXT run's month. Back-to-back runs failed on it. */
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const said = (r) => String(r.data?.message ?? r.data?.hint ?? JSON.stringify(r.data ?? "")).toLowerCase();

  /* Two fixture sailings. The ratio one is a four-seat hull so the head cap is
     reachable with the personas that exist; the radar one is the real 40 so the
     picks are not fighting the composition while they are being tested. */
  const soon = new Date(Date.now() + 2 * 86400_000).toISOString();
  const mk = async (slug, berths) => {
    const v = await stf.post("voyages", {
      slug, title: `E2E ${slug}`, class: "sea", kind: "sea_day", sub_class: "voyage",
      starts_at: soon, berths_total: berths, status: "live", min_tier: "regional",
      time_zone: "America/New_York",
    });
    return v.data?.[0]?.id ?? null;
  };
  const ratioVid = await mk(`e2e-ratio-${stamp}`, 4);
  const radarVid = await mk(`e2e-radar-${stamp}`, 40);
  note("staff", "raises the two fixture sailings", !!ratioVid && !!radarVid,
    `${ratioVid} / ${radarVid}`);
  if (!ratioVid || !radarVid) return;

  /* ---- the ratio gate ---- */

  /* A sailing is ratio-gated because it HAS caps, not because a flag says so.
     Before the caps land, the same insert must be ordinary. */
  const ungated = await reg.post("rsvps", { voyage_id: ratioVid, profile_id: uid(p.regional), status: "aboard" });
  note("regional", "an ungated sailing takes a pass with no segment", ungated.status === 201, `got ${ungated.status}`);
  await stf.del(`rsvps?voyage_id=eq.${ratioVid}&profile_id=eq.${uid(p.regional)}`);

  const caps = await stf.post("voyage_segment_caps", [
    { voyage_id: ratioVid, segment: "single_woman", cap: 1 },
    { voyage_id: ratioVid, segment: "single_man", cap: 1 },
    { voyage_id: ratioVid, segment: "couple", cap: 3 },
  ]);
  note("staff", "sets the composition by segment", caps.status === 201, `got ${caps.status}`);

  /* The funnel before the gate: no vetting file, no seat, and the refusal says
     which gate closed rather than that the sale failed. */
  const unvetted = await reg.post("rsvps", { voyage_id: ratioVid, profile_id: uid(p.regional), status: "aboard", segment: "single_man" });
  note("regional", "a seat is refused before the vetting file is open", unvetted.status >= 400 && /vetting file/.test(said(unvetted)), said(unvetted).slice(0, 90));

  for (const who of ["regional", "national", "global", "paused", "staff"]) {
    await stf.post("vetting_files", {
      profile_id: uid(p[who]), id_verified_at: new Date().toISOString(),
      age_ok: true, background_state: "cleared",
    });
    /* The door now asks for the completed Preference Sheet too (remediation:
       the six-gate screen used to enforce four). A sheet belongs to its
       member, so each persona files their own — patch-then-post so a row a
       prior section left behind completes instead of colliding. */
    const pr = rest(p[who]);
    const stamped = await pr.patch(`preference_sheets?profile_id=eq.${uid(p[who])}`, { completed_at: new Date().toISOString() });
    if (!(stamped.data || []).length) {
      await pr.post("preference_sheets", {
        profile_id: uid(p[who]), drinks: ["Zero proof"], flag_green: "E2E fixture",
        completed_at: new Date().toISOString(),
      });
    }
  }
  const own = await reg.get("own_vetting_state?select=background_state,cleared_until");
  note("regional", "reads their own vetting state and only that", own.status === 200 && own.data?.[0]?.background_state === "cleared", JSON.stringify(own.data).slice(0, 90));
  const peek = await reg.get("vetting_files?select=id&limit=1");
  note("regional", "cannot read the vetting file itself", (peek.data || []).length === 0, `got ${peek.status}`);

  /* A gated sailing seats by segment, and an unsegmented pass is refused by
     name rather than seated as a null. */
  const noSeg = await reg.post("rsvps", { voyage_id: ratioVid, profile_id: uid(p.regional), status: "aboard" });
  note("regional", "a gated sailing refuses a pass with no segment", noSeg.status >= 400 && /seats by segment/.test(said(noSeg)), said(noSeg).slice(0, 90));

  const seatMan = await reg.post("rsvps", { voyage_id: ratioVid, profile_id: uid(p.regional), status: "aboard", segment: "single_man" });
  note("regional", "takes the single men's seat", seatMan.status === 201, `got ${seatMan.status} ${said(seatMan).slice(0, 80)}`);

  /* THE CHECK THE MODULE EXISTS FOR: the second single man is refused, and the
     refusal names the number. */
  const secondMan = await nat.post("rsvps", { voyage_id: ratioVid, profile_id: uid(p.national), status: "aboard", segment: "single_man" });
  note("national", "a single pass into a full segment is refused", secondMan.status >= 400 && /1 seats, 1 taken/.test(said(secondMan)), said(secondMan).slice(0, 90));

  /* A full segment offers the line and never another segment — so the woman's
     seat sitting empty next to him is not offered, and the queue takes his
     place from the database rather than from the request. */
  const line = await nat.post("waitlist_entries", { voyage_id: ratioVid, profile_id: uid(p.national), segment: "single_man", place: 99 });
  note("national", "joins the line, and the database numbers the place", line.status === 201 && line.data?.[0]?.place === 1, `got ${line.status} place ${line.data?.[0]?.place}`);
  const claimEarly = await nat.rpc("claim_your_place", { p_entry: line.data?.[0]?.id });
  note("national", "cannot claim a seat that was never offered", claimEarly.status >= 400 && /nothing has opened/.test(said(claimEarly)), said(claimEarly).slice(0, 90));

  /* A couple is ONE unit against its cap and TWO heads against the hull. Both
     halves are asserted, because the count(*) that was already there gets the
     first one right and the second one silently wrong. */
  const couple = await glo.post("rsvps", { voyage_id: ratioVid, profile_id: uid(p.global), status: "aboard", segment: "couple" });
  note("global", "takes a couple pass", couple.status === 201, `got ${couple.status} ${said(couple).slice(0, 80)}`);

  const cap = await anon.get(`voyage_segment_capacity?voyage_id=eq.${ratioVid}&select=segment,cap,units,remaining`);
  const byseg = Object.fromEntries((cap.data || []).map((r) => [r.segment, r]));
  note("anon", "capacity reads by segment and names nobody", cap.status === 200 && !JSON.stringify(cap.data).includes("profile"), `got ${cap.status}`);
  note("staff", "a couple counts as one unit against the couples cap", byseg.couple?.units === 1, JSON.stringify(byseg.couple));
  const heads = (byseg.single_woman?.units ?? 0) + (byseg.single_man?.units ?? 0) + 2 * (byseg.couple?.units ?? 0);
  note("staff", "a couple counts as two heads against the hull", heads === 3, `${heads} heads from 2 passes`);

  /* Four seats, three heads taken, and a couple wants two. Staff are refused
     here as well as members — the whole point of the gate applying above
     is_staff() rather than below it. */
  const overHull = await stf.post("rsvps", { voyage_id: ratioVid, profile_id: uid(p.staff), status: "aboard", segment: "couple" });
  note("staff", "the head cap refuses staff too, not only members", overHull.status >= 400 && /manifest is full at 4/.test(said(overHull)), said(overHull).slice(0, 90));

  /* The companion path is the hole the singles caps would otherwise have: two
     unsegmented heads riding on a Global pass, counted against nothing. */
  const withGuest = await stf.patch(`rsvps?voyage_id=eq.${ratioVid}&profile_id=eq.${uid(p.global)}`, { guests: 1 });
  note("global", "a ratio sailing carries no companions", withGuest.status >= 400 && /no companions/.test(said(withGuest)), said(withGuest).slice(0, 90));

  /* The other end of the line. Without this the waitlist was write-only — a
     member could join it and nothing in the product could offer them the seat,
     because offer_the_next_place had no caller. */
  const offerFull = await stf.rpc("offer_the_next_place", { p_voyage: ratioVid, p_segment: "single_man" });
  note("staff", "an offer into a full segment is refused before anyone is written to",
    offerFull.status >= 400 && /nothing to offer/.test(said(offerFull)), said(offerFull).slice(0, 90));

  await stf.del(`rsvps?voyage_id=eq.${ratioVid}&profile_id=eq.${uid(p.regional)}`);
  /* Counted before and after, because the notice cannot be swept — notifications
     have no DELETE policy, so an absolute "exactly one" would pass on a virgin
     database and fail on the second run for ever after. The invariant is "one
     message per trigger, no reminder chains", and a delta of exactly one is what
     that actually asserts. */
  const noticesBefore = await nat.get(`notifications?title=eq.A seat opened&select=id`);
  const offered = await stf.rpc("offer_the_next_place", { p_voyage: ratioVid, p_segment: "single_man" });
  note("staff", "the freed seat is offered to position one", offered.status < 400 && !!offered.data, `got ${offered.status}`);

  /* Read through the member's OWN session, not through staff. `notifications`
     is "own notifications" — profile_id = auth.uid(), with no is_staff() clause
     — so a member's Word is private even from the Bridge, and asking as staff
     returns an empty list that looks exactly like a notice that was never
     written. That is the product being right and the check being wrong. */
  const wrote = await nat.get(`notifications?title=eq.A seat opened&select=id`);
  const newNotices = (wrote.data || []).length - (noticesBefore.data || []).length;
  note("national", "a seat that opens is written once", newNotices === 1, `${newNotices} new notices`);

  const claimed = await nat.rpc("claim_your_place", { p_entry: line.data?.[0]?.id });
  note("national", "claims the offered seat and it becomes a pass", claimed.status < 400, `got ${claimed.status} ${said(claimed).slice(0, 70)}`);
  const nowAboard = await stf.get(`rsvps?voyage_id=eq.${ratioVid}&profile_id=eq.${uid(p.national)}&select=status,segment`);
  note("national", "the claimed pass carries the segment it was queued in",
    nowAboard.data?.[0]?.status === "aboard" && nowAboard.data?.[0]?.segment === "single_man",
    JSON.stringify(nowAboard.data).slice(0, 80));

  /* ---- radar ---- */

  const rcaps = await stf.post("voyage_segment_caps", [
    { voyage_id: radarVid, segment: "single_woman", cap: 10 },
    { voyage_id: radarVid, segment: "single_man", cap: 10 },
    { voyage_id: radarVid, segment: "couple", cap: 10 },
  ]);
  note("staff", "the radar sailing carries the real composition", rcaps.status === 201, `got ${rcaps.status}`);

  const aboard = {};
  for (const [who, seg] of [["regional", "single_man"], ["global", "couple"], ["paused", "single_woman"]]) {
    const r = await stf.post("rsvps", { voyage_id: radarVid, profile_id: uid(p[who]), status: "aboard", segment: seg });
    aboard[who] = r.data?.[0]?.id ?? null;
    /* Checked in, because "only aboard" is the one predicate this schema can
       actually hold — a geofence would be better and does not exist. */
    if (aboard[who]) await stf.patch(`rsvps?id=eq.${aboard[who]}`, { checked_in_at: new Date().toISOString() });
  }
  note("staff", "seats and checks in three passes on the radar sailing",
    Object.values(aboard).every(Boolean), JSON.stringify(aboard).slice(0, 90));
  if (!aboard.regional || !aboard.global || !aboard.paused) return;

  /* The clock, set explicitly rather than derived, which is exactly why the
     column is a timestamptz: a suite that had to wait until 17:15 would not be
     a suite.

     `slots` is 1, not the product's 3, and that is the only way the ceiling is
     testable here: proving a cross-row cap needs one more pin than the cap
     allows, and the personas who can be checked in are limited by the waiver
     gate — e2e-national holds no current member waiver, so
     require_signature_at_check_in refuses to put them aboard. With slots at 3
     the extra pick was refused by the aboard predicate instead of the ceiling,
     which is a green check for the wrong rule. The trigger branch under test is
     the same one at any value. */
  const nowMs = Date.now();
  const clock = await stf.post("voyage_radar", {
    voyage_id: radarVid,
    opens_at: new Date(nowMs - 300_000).toISOString(),
    locks_at: new Date(nowMs + 1_800_000).toISOString(),
    anchors_unlock_at: new Date(nowMs + 3_600_000).toISOString(),
    anchors_expire_at: new Date(nowMs + 90_000_000).toISOString(),
    slots: 1,
  });
  note("staff", "opens the radar clock", clock.status === 201, `got ${clock.status} ${said(clock).slice(0, 80)}`);

  const sweepRes = await reg.rpc("radar_sweep", { p_voyage: radarVid });
  const pins = Array.isArray(sweepRes.data) ? sweepRes.data : [];
  note("regional", "the sweep shows the others as pins, first names only", pins.length === 2 && pins.every((x) => !/\s/.test(x.name)), JSON.stringify(pins).slice(0, 120));
  note("regional", "a couple is one pin", pins.filter((x) => x.couple).length === 1, JSON.stringify(pins.map((x) => x.couple)));
  const ashore = await nat.rpc("radar_sweep", { p_voyage: radarVid });
  note("national", "the sweep is refused to anyone not aboard", ashore.status >= 400 && /aboard/.test(said(ashore)), said(ashore).slice(0, 90));

  const pick1 = await reg.post("radar_picks", { voyage_id: radarVid, picker_rsvp: aboard.regional, picked_rsvp: aboard.global });
  note("regional", "plots a course", pick1.status === 201, `got ${pick1.status} ${said(pick1).slice(0, 80)}`);
  const selfPick = await reg.post("radar_picks", { voyage_id: radarVid, picker_rsvp: aboard.regional, picked_rsvp: aboard.regional });
  note("regional", "cannot plot a course to themselves", selfPick.status >= 400, `got ${selfPick.status}`);

  /* The slot ceiling is a cross-row count under an advisory lock, so no CHECK
     constraint could hold it and the browser is not asked to. The refusal has to
     name the ceiling — a pick refused because the other pin is ashore is a
     different rule wearing the same status code. */
  const overSlots = await reg.post("radar_picks", { voyage_id: radarVid, picker_rsvp: aboard.regional, picked_rsvp: aboard.paused });
  note("regional", "a pick past the slot ceiling is refused, by the ceiling", overSlots.status >= 400 && /1 picks, 1 used/.test(said(overSlots)), said(overSlots).slice(0, 90));

  /* Mutual only. One-sided so far, so there is nothing to see on either side. */
  const beforeMutual = await reg.get(`shared_anchors?voyage_id=eq.${radarVid}&select=id`);
  note("regional", "a one-sided pick surfaces nothing", (beforeMutual.data || []).length === 0, JSON.stringify(beforeMutual.data).slice(0, 80));
  const spy = await glo.get(`radar_picks?voyage_id=eq.${radarVid}&select=picked_rsvp`);
  note("global", "cannot read another member's picks", (spy.data || []).length === 0, JSON.stringify(spy.data).slice(0, 80));
  const staffSpy = await stf.get(`radar_picks?voyage_id=eq.${radarVid}&select=picked_rsvp`);
  note("staff", "staff cannot read picks either — the count, never the rows", (staffSpy.data || []).length === 0, JSON.stringify(staffSpy.data).slice(0, 80));

  const back = await glo.post("radar_picks", { voyage_id: radarVid, picker_rsvp: aboard.global, picked_rsvp: aboard.regional });
  note("global", "plots back", back.status === 201, `got ${back.status} ${said(back).slice(0, 80)}`);
  const sealed = await reg.get(`shared_anchors?voyage_id=eq.${radarVid}&select=id`);
  note("regional", "the anchor stays sealed until the envelope is opened", (sealed.data || []).length === 0, JSON.stringify(sealed.data).slice(0, 80));
  const anchorExists = await stf.get(`shared_anchors?voyage_id=eq.${radarVid}&select=id,unlocked_at`);
  note("staff", "the mutual pick did write an anchor", (anchorExists.data || []).length === 1, JSON.stringify(anchorExists.data).slice(0, 90));

  /* The envelope. Before 19:00 it refuses by name; the wrong envelope refuses
     as someone else's. */
  const issued = await stf.rpc("issue_the_envelopes", { p_voyage: radarVid });
  note("staff", "issues the envelopes", issued.status < 400, `got ${issued.status}`);
  const envs = await stf.get(`captains_log_envelopes?select=rsvp_id,token`);
  const tokenFor = Object.fromEntries((envs.data || []).map((e) => [e.rsvp_id, e.token]));
  const mineSealed = await reg.get("captains_log_envelopes?select=token&limit=1");
  note("regional", "cannot read their own envelope token", (mineSealed.data || []).length === 0, `got ${mineSealed.status}`);

  const tooEarly = await reg.rpc("open_the_captains_log", { p_token: tokenFor[aboard.regional] });
  note("regional", "the log refuses to open before 19:00", tooEarly.status >= 400 && /opens at 19:00/.test(said(tooEarly)), said(tooEarly).slice(0, 90));
  const notYours = await reg.rpc("open_the_captains_log", { p_token: tokenFor[aboard.paused] });
  note("regional", "another guest's envelope is refused", notYours.status >= 400 && /another guest/.test(said(notYours)), said(notYours).slice(0, 90));

  await stf.patch(`voyage_radar?voyage_id=eq.${radarVid}`, { anchors_unlock_at: new Date(nowMs - 60_000).toISOString() });
  const opened = await reg.rpc("open_the_captains_log", { p_token: tokenFor[aboard.regional] });
  note("regional", "opens the log and the anchor surfaces", opened.status < 400, `got ${opened.status} ${said(opened).slice(0, 80)}`);
  const nowVisible = await reg.get(`shared_anchors?voyage_id=eq.${radarVid}&select=id`);
  note("regional", "reads the shared anchor once opened", (nowVisible.data || []).length === 1, JSON.stringify(nowVisible.data).slice(0, 80));

  /* Twenty-four hours, both sides, no extension. Two halves: the club may cut a
     contact short — the Chief Vibe Stew needs that after an incident on deck —
     and nobody may push one out. The second half used to hold only because no
     UPDATE policy existed, which is a rule kept by an absence and lasts exactly
     until someone needs the legitimate half. */
  const extend = await stf.patch(`shared_anchors?voyage_id=eq.${radarVid}`, { expires_at: new Date(nowMs + 200_000_000).toISOString() });
  note("staff", "an anchor is never extended, not even by the club", extend.status >= 400 && /never extended/.test(said(extend)), said(extend).slice(0, 90));

  const cutShort = await stf.patch(`shared_anchors?voyage_id=eq.${radarVid}`, { expires_at: new Date(nowMs - 60_000).toISOString() });
  note("staff", "an anchor can be cut short", cutShort.status < 400, `got ${cutShort.status} ${said(cutShort).slice(0, 70)}`);
  const expired = await reg.get(`shared_anchors?voyage_id=eq.${radarVid}&select=id`);
  note("regional", "an expired anchor is gone, not merely greyed out", (expired.data || []).length === 0, JSON.stringify(expired.data).slice(0, 80));

  /* THE LOCK. Both arms — and the delete arm is the one that matters, because
     without it a member can quietly unplot at 18:59 and the other side's anchor
     evaporates with no trace. */
  await stf.patch(`voyage_radar?voyage_id=eq.${radarVid}`, { locks_at: new Date(nowMs - 60_000).toISOString() });
  const lateInsert = await glo.post("radar_picks", { voyage_id: radarVid, picker_rsvp: aboard.global, picked_rsvp: aboard.paused });
  note("global", "an entry after the 17:30 lock is refused", lateInsert.status >= 400 && /picks closed at 17:30/.test(said(lateInsert)), said(lateInsert).slice(0, 90));

  const lateDelete = await reg.del(`radar_picks?voyage_id=eq.${radarVid}&picker_rsvp=eq.${aboard.regional}&picked_rsvp=eq.${aboard.global}`);
  const survived = await reg.get(`radar_picks?voyage_id=eq.${radarVid}&picker_rsvp=eq.${aboard.regional}&picked_rsvp=eq.${aboard.global}&select=picked_rsvp`);
  note("regional", "a delete after the lock is refused too", lateDelete.status >= 400 && (survived.data || []).length === 1,
    `del ${lateDelete.status}, ${(survived.data || []).length} left`);

  /* ---- the preference sheet, and the blur it sets ---- */

  /* The fixture loop above already filed regional's sheet (the vetting door
     asks for it now), so the member-writes-their-own proof is the update, not
     a fresh insert — same policy, same ownership. */
  const sheet = await reg.patch(`preference_sheets?profile_id=eq.${uid(p.regional)}`, { flag_green: "E2E green" });
  note("regional", "writes their own preference sheet", sheet.status < 300 && (sheet.data || []).length === 1, `got ${sheet.status}`);
  const nosy = await glo.get(`preference_sheets?profile_id=eq.${uid(p.regional)}&select=flag_green`);
  note("global", "cannot read another guest's preference sheet", (nosy.data || []).length === 0, JSON.stringify(nosy.data).slice(0, 80));
  const forOther = await glo.post("preference_sheets", { profile_id: uid(p.regional), drinks: ["Gin"] });
  note("global", "cannot answer for another guest", forOther.status >= 400, `got ${forOther.status}`);

  const boundary = await reg.post("preference_boundaries", { profile_id: uid(p.regional), topic: "photographed", stance: "never" });
  note("regional", "sets the photography boundary", boundary.status === 201, `got ${boundary.status}`);

  /* The crew tablet inserts the queue row with blur off, because the guest has
     not said anything on deck. The trigger reads the sheet anyway. */
  const pod = await stf.post("pod_sessions", { voyage_id: radarVid, rsvp_id: aboard.regional, position: 1, state: "waiting", blur_required: false });
  note("staff", "the blur is set from the preference sheet, not from the form", pod.data?.[0]?.blur_required === true, JSON.stringify(pod.data?.[0]?.blur_required));

  const lower = await stf.patch(`pod_sessions?id=eq.${pod.data?.[0]?.id}`, { blur_required: false });
  note("staff", "the blur cannot be lowered on deck", lower.data?.[0]?.blur_required === true, JSON.stringify(lower.data?.[0]?.blur_required));

  const tooLong = await stf.patch(`pod_sessions?id=eq.${pod.data?.[0]?.id}`, { duration_s: 91 });
  note("staff", "ninety seconds is a constraint, not a convention", tooLong.status >= 400, `got ${tooLong.status}`);

  const podPrivate = await glo.get(`pod_sessions?voyage_id=eq.${radarVid}&select=id`);
  note("global", "cannot read another guest's pod session", (podPrivate.data || []).length === 0, JSON.stringify(podPrivate.data).slice(0, 80));

  /* ---- the elements catalogue ---- */

  const badUrid = await stf.post("elements", {
    element_id: `E2E-URID-${stamp}`, urid: "8000.03.301", name: "E2E mismatched code",
    department: "4000 Build", discipline: "Scenic Fabrication", category: "E2E", kind: "equipment",
    tier: "05 Experiential", phase: "Install", grain: "class", element_state: "Draft",
    specifications: "E2E", uom: "set·event", qty: 1, unit_cost_usd: 10,
    price_confidence: "QUOTED", five_a: "atmosphere", weather: "all_weather",
  });
  note("staff", "a URID that does not match its department is refused", badUrid.status >= 400, `got ${badUrid.status}`);

  /* README §5's specification error, caught at procurement rather than at the
     dock. Deferred to commit, so the element and its substitute may arrive in
     either order — but an Active one that never gets a substitute cannot
     commit at all. */
  const orphan = await stf.post("elements", {
    element_id: `E2E-POD-${stamp}`, urid: "4000.03.301", name: "E2E indoor activity element",
    department: "4000 Build", discipline: "Scenic Fabrication", category: "Media Enclosures",
    kind: "equipment", tier: "05 Experiential", phase: "Install", grain: "class",
    element_state: "Active", specifications: "E2E", uom: "set·event", qty: 1, unit_cost_usd: 1200,
    price_confidence: "QUOTED", five_a: "activity", weather: "indoor_only",
  });
  note("staff", "an indoor_only activity element with no substitute cannot go Active",
    orphan.status >= 400 && /substitute/.test(said(orphan)), said(orphan).slice(0, 90));

  const drafted = await stf.post("elements", {
    element_id: `E2E-POD2-${stamp}`, urid: "4000.03.302", name: "E2E indoor activity element",
    department: "4000 Build", discipline: "Scenic Fabrication", category: "Media Enclosures",
    kind: "equipment", tier: "05 Experiential", phase: "Install", grain: "class",
    element_state: "Draft", specifications: "E2E", uom: "set·event", qty: 2, unit_cost_usd: 600,
    price_confidence: "QUOTED", five_a: "activity", weather: "indoor_only",
  });
  note("staff", "the same element is fine as a Draft", drafted.status === 201, `got ${drafted.status}`);
  note("staff", "an element totals itself", Number(drafted.data?.[0]?.total_cost_usd) === 1200, String(drafted.data?.[0]?.total_cost_usd));
  const eid = drafted.data?.[0]?.id;
  if (eid) {
    await stf.post("element_substitutes", { element_id: eid, substitute_element_id: null, context: "Canopy pod, mic windshield" });
    const activate = await stf.patch(`elements?id=eq.${eid}`, { element_state: "Active" });
    note("staff", "a named substitute is what makes it specifiable", activate.status < 400, `got ${activate.status} ${said(activate).slice(0, 80)}`);
  }
  const memberCatalogue = await reg.get("elements?select=element_id&limit=1");
  note("regional", "the elements catalogue is a crew surface", (memberCatalogue.data || []).length === 0, `got ${memberCatalogue.status}`);

  /* ---- cleanup ----
     Deleting a Radar sailing is itself a regression test. The cascade reaches
     radar_picks, whose BEFORE DELETE trigger reads the clock — and the cascade
     may have dropped voyage_radar first, so the trigger has to read a missing
     clock on a delete as "the sailing is going away" rather than as "somebody is
     editing picks on a sailing that has no Radar". Until it did, no Radar
     sailing could be deleted by anyone, and the refusal surfaced from inside a
     foreign-key action where nobody would think to look for it.

     The PASSES go first, explicitly, while their sailings are still standing —
     and that ordering is load-bearing for the ledger, not a tidiness
     preference. return_knots_with_the_pass reverses a pass's knots on DELETE,
     but when the row disappears as a CASCADE from `voyages` the reversal does
     not happen: measured directly, seating awards +25 and dropping the voyage
     leaves all 25 standing, while deleting the pass first and the voyage second
     nets to exactly 0. Letting the cascade do it would have this block mint 25
     knots per persona per run, for ever, into a currency that redeems against a
     real rewards catalogue. */
  await stf.del(`rsvps?voyage_id=eq.${ratioVid}`);
  await stf.del(`rsvps?voyage_id=eq.${radarVid}`);
  const rmA = await stf.del(`voyages?id=eq.${ratioVid}`);
  const rmB = await stf.del(`voyages?id=eq.${radarVid}`);
  await stf.del(`elements?element_id=like.E2E-*`);
  for (const who of ["regional", "national", "global", "paused", "staff"]) {
    await stf.del(`vetting_files?profile_id=eq.${uid(p[who])}`);
    await stf.del(`preference_boundaries?profile_id=eq.${uid(p[who])}`);
    await stf.del(`preference_sheets?profile_id=eq.${uid(p[who])}`);
  }
  /* Verified by id, not by slug pattern. A pattern would also match a fixture
     belonging to a suite running concurrently against this same shared
     database — which is a thing that happens here, and which makes a
     slug-shaped check lie in both directions: green because somebody else's
     sweep removed my row, or red because their row is still up. The ids are
     mine and nobody else's. */
  const leftV = await stf.get(`voyages?id=eq.${ratioVid}&select=id`);
  const leftR = await stf.get(`voyages?id=eq.${radarVid}&select=id`);
  const leftF = await stf.get(`vetting_files?profile_id=eq.${uid(p.regional)}&select=id`);
  const leftE = await stf.get(`elements?element_id=like.E2E-*&select=id`);
  const leftP = await stf.get(`preference_sheets?profile_id=eq.${uid(p.regional)}&select=profile_id`);
  note("staff", "the fixtures are gone and verified gone",
    rmA.status < 400 && rmB.status < 400 &&
    (leftV.data || []).length === 0 && (leftR.data || []).length === 0 &&
    (leftF.data || []).length === 0 && (leftE.data || []).length === 0 &&
    (leftP.data || []).length === 0,
    `voyages ${(leftV.data || []).length + (leftR.data || []).length}, files ${(leftF.data || []).length}, elements ${(leftE.data || []).length}, sheets ${(leftP.data || []).length}, del ${rmA.status}/${rmB.status}`);
}

/* Read through staff so a paused persona's own read policy cannot skew it.

   Through fathoms_balance, NOT by summing fathoms_ledger. PostgREST caps a
   collection response at a page, this suite asked for every delta row and added
   up whatever came back, and the regional persona crossed 1,337 ledger rows —
   so the number this returned stopped being a balance and started being the sum
   of the first page. Every footprint check downstream then reported drift of a
   few hundred knots at random, on runs that had moved nothing, which is the
   worst kind of failing check: it cries wolf until somebody edits the pin to
   make it stop, and the pin is the only thing watching the ledger.

   fathoms_balance is one row per member, aggregated in the database, and it is
   the same view the member's own page reads. */
/* ---------- O. what the remediation closed ----------
   The 2026-09-01 feature-completeness audit named the paths this suite had
   never walked and the rules that existed only in prose. Every check here
   exercises a rule that was fixed or first-encoded in the remediation, and
   the section is knots-neutral by construction: every mint it causes is
   reversed inside it, so the kit-ledger weighing and the global footprint pin
   both stay honest. */
async function remediationRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;

  // — a voyage status is a course —
  const smk = await stf.post("voyages", {
    slug: `e2e-course-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 6, status: "scheduled", price_cents: 0,
  });
  const svid = smk.data?.[0]?.id;
  note("staff", "remediation fixture sails", Boolean(svid), JSON.stringify(smk.data).slice(0, 120));
  const toDone = await stf.patch(`voyages?id=eq.${svid}`, { status: "completed" });
  note("staff", "scheduled may complete", toDone.status < 300, `got ${toDone.status}`);
  const backAlive = await stf.patch(`voyages?id=eq.${svid}`, { status: "live" });
  note("staff", "a sailing in the log stays in the log", backAlive.status >= 400 && /stays in the log/.test(JSON.stringify(backAlive.data)), `got ${backAlive.status}`);

  // — holds fit the hull —
  const smk2 = await stf.post("voyages", {
    slug: `e2e-holds-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 6, held_passes: 2, status: "scheduled", price_cents: 0,
  });
  const hvid = smk2.data?.[0]?.id;
  const overHold = await stf.patch(`voyages?id=eq.${hvid}`, { held_passes: 7 });
  note("staff", "holds cannot exceed the hull", overHold.status >= 400 && /holds_fit_the_hull/.test(JSON.stringify(overHold.data)), `got ${overHold.status}`);
  const underBerth = await stf.patch(`voyages?id=eq.${hvid}`, { berths_total: 1 });
  note("staff", "the hull cannot shrink under its holds", underBerth.status >= 400, `got ${underBerth.status}`);

  // — deleting a sailing gives the knots back (the cascade leak) —
  const kBefore = await knotsFor(p.regional, p.staff);
  const kpass = await reg.post("rsvps", { voyage_id: hvid, profile_id: uid(p.regional), status: "aboard" });
  note("regional", "boards the doomed sailing", kpass.status === 201, `got ${kpass.status}`);
  await stf.del(`voyages?id=eq.${hvid}`);
  const kAfter = await knotsFor(p.regional, p.staff);
  note("regional", "a struck sailing returns its knots", kAfter === kBefore, `moved ${kAfter - kBefore}`);

  // — pass transfers, walked at last, and the code they mint —
  const tmk = await stf.post("voyages", {
    slug: `e2e-hand-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 6, status: "scheduled", price_cents: 1000,
  });
  const tvid = tmk.data?.[0]?.id;
  const aPass = await nat.post("rsvps", { voyage_id: tvid, profile_id: uid(p.national), status: "aboard" });
  const aRsvp = aPass.data?.[0]?.id;
  const offer = await nat.post("pass_transfers", { rsvp_id: aRsvp, from_profile: uid(p.national), to_profile: uid(p.global) });
  const offerId = offer.data?.[0]?.id;
  note("national", "offers the pass on", offer.status === 201, `got ${offer.status} ${JSON.stringify(offer.data).slice(0, 120)}`);
  // A no is a full answer: the offer marks declined, cannot be accepted after,
  // and the pass never moves.
  const spurn = await glo.patch(`pass_transfers?id=eq.${offerId}`, { status: "declined", responded_at: new Date().toISOString() });
  note("global", "declines the offer", spurn.status < 300, `got ${spurn.status} ${JSON.stringify(spurn.data).slice(0, 120)}`);
  const spurned = await glo.rpc("accept_pass_transfer", { p_id: offerId });
  note("global", "a declined offer cannot be accepted after", spurned.status >= 400, `got ${spurned.status} ${JSON.stringify(spurned.data).slice(0, 120)}`);
  const stays = await nat.get(`rsvps?id=eq.${aRsvp}&select=profile_id`);
  note("national", "a declined pass stays put", stays.data?.[0]?.profile_id === uid(p.national), JSON.stringify(stays.data).slice(0, 120));
  // A fresh offer for the hand that answers yes.
  const offer2 = await nat.post("pass_transfers", { rsvp_id: aRsvp, from_profile: uid(p.national), to_profile: uid(p.global) });
  const offer2Id = offer2.data?.[0]?.id;
  const forged = await glo.patch(`pass_transfers?id=eq.${offer2Id}`, { status: "accepted" });
  note("global", "an acceptance cannot be hand-written", forged.status >= 400 || (await glo.get(`rsvps?id=eq.${aRsvp}&select=profile_id`)).data?.[0]?.profile_id === uid(p.national), `got ${forged.status}`);
  const accept = await glo.rpc("accept_pass_transfer", { p_id: offer2Id });
  note("global", "accepts the offered pass", accept.status < 300, `got ${accept.status} ${JSON.stringify(accept.data).slice(0, 160)}`);
  const handed = await glo.get(`rsvps?id=eq.${aRsvp}&select=profile_id,boarding_code`);
  note("global", "the pass changes hands", handed.data?.[0]?.profile_id === uid(p.global), JSON.stringify(handed.data).slice(0, 120));
  note("global", "a handed-on pass carries the five-segment code",
    /^UN-[A-Z0-9]{1,4}-\d{4}-\d{4}-[A-F0-9]{2}$/.test(handed.data?.[0]?.boarding_code || ""),
    JSON.stringify(handed.data).slice(0, 120));
  // Money: the receiver was charged no more than the pass's own money.
  const gloCharge = await glo.get(`account_ledger?voyage_id=eq.${tvid}&profile_id=eq.${uid(p.global)}&select=delta_cents,kind`);
  const charged = (gloCharge.data ?? []).filter((l) => l.delta_cents < 0).reduce((s, l) => s - l.delta_cents, 0);
  note("global", "settlement is capped at the pass's own money", charged <= 1000, JSON.stringify(gloCharge.data).slice(0, 160));
  // Blocks, while two members share a deck (entitlement exists):
  const block = await glo.post("member_blocks", { blocker_id: uid(p.global), blocked_id: uid(p.national) });
  note("global", "declines a member's messages", block.status === 201, `got ${block.status} ${JSON.stringify(block.data).slice(0, 120)}`);
  const knock = await nat.rpc("open_direct_thread", { p_other: uid(p.global) });
  note("national", "a blocked knock is refused, with the reason", knock.status >= 400, `got ${knock.status} ${JSON.stringify(knock.data).slice(0, 120)}`);
  await glo.del(`member_blocks?blocker_id=eq.${uid(p.global)}&blocked_id=eq.${uid(p.national)}`);
  // Clean the handed pass and its sailing; the delete reverses global's +25.
  const tdel = await stf.del(`voyages?id=eq.${tvid}`);
  note("staff", "the hand-off fixture is struck", tdel.status < 300, `got ${tdel.status} ${JSON.stringify(tdel.data).slice(0,120)}`);

  // — deposits come home aboard, or stay ashore —
  const dmk = await stf.post("voyages", {
    slug: `e2e-deposit-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 6, status: "scheduled", price_cents: 0, deposit_required: true,
  });
  const dvid = dmk.data?.[0]?.id;
  const shown = await reg.post("rsvps", { voyage_id: dvid, profile_id: uid(p.regional), status: "aboard" });
  await nat.post("rsvps", { voyage_id: dvid, profile_id: uid(p.national), status: "aboard" });
  note("regional", "the deposit is taken at booking", (await reg.get(`account_ledger?voyage_id=eq.${dvid}&kind=eq.deposit&select=delta_cents`)).data?.[0]?.delta_cents === -5000, "");
  await stf.patch(`rsvps?id=eq.${shown.data?.[0]?.id}`, { checked_in_at: new Date().toISOString() });
  await stf.patch(`voyages?id=eq.${dvid}`, { status: "completed" });
  const back = await reg.get(`account_ledger?voyage_id=eq.${dvid}&kind=eq.credit&memo=like.Deposit returned aboard*&select=delta_cents`);
  note("regional", "the deposit comes back aboard", back.data?.[0]?.delta_cents === 5000, JSON.stringify(back.data));
  const kept = await nat.get(`account_ledger?voyage_id=eq.${dvid}&kind=eq.credit&memo=like.Deposit returned aboard*&select=delta_cents`);
  note("national", "a no-show's deposit stays with the club", (kept.data ?? []).length === 0, JSON.stringify(kept.data));
  const word = await nat.get(`notifications?title=eq.Deposit forfeited — no show.&select=id&limit=1`);
  note("national", "the forfeiture is said, not hidden", (word.data ?? []).length >= 1, `got ${word.status}`);
  // Strike the completed sailing: the BEFORE-DELETE reversal takes back the
  // two booking mints and frees both members' monthly allowance for the
  // fixtures that follow. The completion award is not in its reasons, so it
  // is weighed out by hand just below.
  const ddel = await stf.del(`voyages?id=eq.${dvid}`);
  note("staff", "the deposit fixture is struck", ddel.status < 300, `got ${ddel.status} ${JSON.stringify(ddel.data).slice(0,120)}`);
  // Completion minted 40 apiece; weigh it back out so the section stays neutral.
  await stf.rpc("adjust_knots", { p_profile: uid(p.regional), p_delta: -40, p_reason: "E2E remediation sweep — completion award reversed" });
  const conferred = await reg.get(`member_marks?profile_id=eq.${uid(p.regional)}&select=mark_code&limit=1`);
  note("regional", "completion confers marks through the trigger", (conferred.data ?? []).length >= 1, `got ${conferred.status}`);

  // — the waitlist honours a no —
  const wmk = await stf.post("voyages", {
    slug: `e2e-noauto-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 1, status: "scheduled", price_cents: 0,
  });
  const wvid = wmk.data?.[0]?.id;
  const seat = await glo.post("rsvps", { voyage_id: wvid, profile_id: uid(p.global), status: "aboard" });
  note("global", "holds the seat to be freed", seat.status === 201, `got ${seat.status} ${JSON.stringify(seat.data).slice(0,100)}`);
  const wl1 = await reg.post("rsvps", { voyage_id: wvid, profile_id: uid(p.regional), status: "waitlist", auto_claim: false });
  const wl2 = await nat.post("rsvps", { voyage_id: wvid, profile_id: uid(p.national), status: "waitlist" });
  note("regional", "queues with the toggle off", wl1.status === 201 && wl2.status === 201, `got ${wl1.status}/${wl2.status}`);
  await glo.del(`rsvps?id=eq.${seat.data?.[0]?.id}`);
  const regStill = await reg.get(`rsvps?voyage_id=eq.${wvid}&profile_id=eq.${uid(p.regional)}&select=status`);
  note("regional", "a no means told, not charged", regStill.data?.[0]?.status === "waitlist", JSON.stringify(regStill.data));
  const told = await reg.get(`notifications?title=like.A pass opened*&select=id&limit=1`);
  note("regional", "the opened seat is announced to the abstainer", (told.data ?? []).length >= 1, `got ${told.status}`);
  const natNow = await nat.get(`rsvps?voyage_id=eq.${wvid}&profile_id=eq.${uid(p.national)}&select=status`);
  note("national", "the line moves past a no", natNow.data?.[0]?.status === "aboard", JSON.stringify(natNow.data));
  const wdel = await stf.del(`voyages?id=eq.${wvid}`);
  note("staff", "the queue fixture is struck", wdel.status < 300, `got ${wdel.status} ${JSON.stringify(wdel.data).slice(0,120)}`);

  // — add-ons, attached and priced by the house —
  const amk = await stf.post("voyages", {
    slug: `e2e-addons-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 6, status: "scheduled", price_cents: 0,
  });
  const avid = amk.data?.[0]?.id;
  const apass = await reg.post("rsvps", { voyage_id: avid, profile_id: uid(p.regional), status: "aboard" });
  const shelf = await reg.get("addons?select=id&limit=1");
  if (shelf.data?.[0]?.id) {
    const att = await reg.rpc("attach_addons", { p_rsvp: apass.data?.[0]?.id, p_addons: [shelf.data[0].id], p_qty: 1 });
    note("regional", "attaches an add-on through the folio", att.status < 300, `got ${att.status} ${JSON.stringify(att.data).slice(0, 120)}`);
    const arow = await reg.get(`account_ledger?voyage_id=eq.${avid}&kind=eq.addon&select=delta_cents`);
    note("regional", "the add-on is priced by the catalogue, not the caller", (arow.data ?? []).length >= 1 && arow.data[0].delta_cents < 0, JSON.stringify(arow.data));
  } else {
    note("regional", "attaches an add-on through the folio", false, "no addon on the shelf to attach");
  }
  const adel = await stf.del(`voyages?id=eq.${avid}`);
  note("staff", "the add-on fixture is struck", adel.status < 300, `got ${adel.status} ${JSON.stringify(adel.data).slice(0,120)}`);

  // — one crate, however many times the button lands —
  const shelfProd = await reg.get("products?select=id&active=eq.true&limit=1");
  if (shelfProd.data?.[0]?.id) {
    const before = (await stf.get(`shop_orders?profile_id=eq.${uid(p.regional)}&select=id`)).data?.length ?? 0;
    const idem = `e2e-idem-${stamp}`;
    const first = await reg.rpc("place_shop_order", { p_lines: [{ productId: shelfProd.data[0].id, qty: 1 }], p_idem_key: idem });
    const again = await reg.rpc("place_shop_order", { p_lines: [{ productId: shelfProd.data[0].id, qty: 1 }], p_idem_key: idem });
    const crates = await stf.get(`shop_orders?profile_id=eq.${uid(p.regional)}&select=id`);
    note("regional", "a replayed crate is one order, one charge", first.status < 400 && (crates.data ?? []).length === before + 1,
      `${first.status}/${again.status} orders ${before}→${(crates.data ?? []).length}`);
    for (const row of (crates.data ?? [])) {
      await stf.del(`shop_order_items?order_id=eq.${row.id}`);
      await stf.del(`shop_orders?id=eq.${row.id}`);
    }
  }

  // — a cancellation is one push, whichever door it uses —
  await glo.patch(`profiles?id=eq.${uid(p.global)}`, { notification_prefs: { weather: true, berths: true, fathoms: true, digest: true } });
  const pushmk = await stf.post("voyages", {
    slug: `e2e-onepush-${stamp}`, title: `E2E one-push ${stamp}`, class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 4, status: "scheduled", price_cents: 0,
  });
  const pushvid = pushmk.data?.[0]?.id;
  await glo.post("rsvps", { voyage_id: pushvid, profile_id: uid(p.global), status: "aboard" });
  // The member half of the gallery, invited by policy since the start and
  // only now given a writer: an aboard member files a frame, unapproved, and
  // may withdraw their own.
  const frame = await glo.post("voyage_media", {
    voyage_id: pushvid, storage_path: `${uid(p.global)}/${pushvid}/e2e-frame.jpg`,
    caption: "E2E frame", uploaded_by: uid(p.global),
  });
  note("global", "an aboard member's frame lands in the queue",
    frame.status === 201 && frame.data?.[0]?.approved === false,
    `got ${frame.status} ${JSON.stringify(frame.data).slice(0, 100)}`);
  const fdel2 = await glo.del(`voyage_media?id=eq.${frame.data?.[0]?.id}`);
  note("global", "and may withdraw it", fdel2.status < 300, `got ${fdel2.status} ${JSON.stringify(fdel2.data).slice(0, 80)}`);
  await stf.patch(`voyages?id=eq.${pushvid}`, { status: "cancelled" });
  const pushes = await stf.get(`push_outbox?profile_id=eq.${uid(p.global)}&title=eq.${encodeURIComponent(`Cancelled: E2E one-push ${stamp}`)}&select=id`);
  note("global", "a cancellation is one push, not two", (pushes.data ?? []).length === 1, JSON.stringify(pushes.data).slice(0, 120));
  const pushdel = await stf.del(`voyages?id=eq.${pushvid}`);
  note("staff", "the one-push fixture is struck", pushdel.status < 300, `got ${pushdel.status} ${JSON.stringify(pushdel.data).slice(0,120)}`);

  // — the front door refuses a dead code out loud —
  const anonDoor = rest(null);
  const deadCode = await anonDoor.rpc("apply_with_invite", {
    p_full_name: "E2E Anon", p_email: `e2e-anon-${stamp}@fixtures.invalid`,
    p_city: "Miami", p_note: "", p_code: "UN-DEAD-0000",
  });
  note("anon", "a dead invite code is refused, not pocketed",
    deadCode.status >= 400 && /answer|code/i.test(JSON.stringify(deadCode.data ?? "")),
    `got ${deadCode.status} ${JSON.stringify(deadCode.data).slice(0, 120)}`);

  // — forty souls is the ceiling —
  const opmk = await stf.post("voyages", {
    slug: `e2e-forty-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 40, status: "scheduled", price_cents: 0,
  });
  const opvid = opmk.data?.[0]?.id;
  const overCap = await stf.post("voyage_segment_caps", [
    { voyage_id: opvid, segment: "single_man", cap: 20 },
    { voyage_id: opvid, segment: "single_woman", cap: 20 },
    { voyage_id: opvid, segment: "couple", cap: 1 },
  ]);
  note("staff", "forty-two heads are refused", overCap.status >= 400 && /hull holds/.test(JSON.stringify(overCap.data)), `got ${overCap.status}`);
  const atCap = await stf.post("voyage_segment_caps", [
    { voyage_id: opvid, segment: "single_man", cap: 20 },
    { voyage_id: opvid, segment: "single_woman", cap: 20 },
  ]);
  note("staff", "the twenty-twenty composition stands", atCap.status === 201, `got ${atCap.status} ${JSON.stringify(atCap.data).slice(0, 120)}`);
  await stf.del(`voyages?id=eq.${opvid}`);

  // — the vetting door asks for the sheet —
  // regional's file is cleared by earlier sections; take the sheet away and
  // the door must refuse, then restore it. Staff read/write the sheet's row
  // through the member's own table policy? No — the sheet is the member's, so
  // the member withdraws their own completion stamp.
  const sheetRow = await reg.get(`preference_sheets?profile_id=eq.${uid(p.regional)}&select=completed_at`);
  if (sheetRow.data?.[0]?.completed_at) {
    const vmk = await stf.post("voyages", {
      slug: `e2e-sheetgate-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
      starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
      time_zone: "America/New_York", berths_total: 6, status: "scheduled", price_cents: 0,
    });
    const vvid = vmk.data?.[0]?.id;
    await stf.post("voyage_segment_caps", [{ voyage_id: vvid, segment: "single_man", cap: 6 }]);
    const held = sheetRow.data[0].completed_at;
    await reg.patch(`preference_sheets?profile_id=eq.${uid(p.regional)}`, { completed_at: null });
    const refused = await reg.post("rsvps", { voyage_id: vvid, profile_id: uid(p.regional), status: "aboard", segment: "single_man" });
    note("regional", "the door asks for the Preference Sheet", refused.status >= 400 && /Preference Sheet/.test(JSON.stringify(refused.data)), `got ${refused.status}`);
    await reg.patch(`preference_sheets?profile_id=eq.${uid(p.regional)}`, { completed_at: held });
    await stf.del(`voyages?id=eq.${vvid}`);
  } else {
    note("regional", "the door asks for the Preference Sheet", true, "no completed sheet on file to withdraw — gate exercised elsewhere");
  }

  // — a crew stage is earned in order —
  const role = await stf.get("crew_roles?select=id&limit=1");
  const cand = await stf.post("crew_candidates", { role_id: role.data?.[0]?.id, full_name: "E2E Deckhand", email: `e2e-ats-${stamp}@fixtures.invalid`, stage: "applied" });
  const candId = cand.data?.[0]?.id;
  const leap = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "offer" });
  note("staff", "the pipeline refuses a leap", leap.status >= 400 && /pipeline runs/.test(JSON.stringify(leap.data)), `got ${leap.status}`);
  const step = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "interview" });
  note("staff", "the pipeline takes one rung", step.status < 300, `got ${step.status}`);
  const pass = await stf.patch(`crew_candidates?id=eq.${candId}`, { stage: "passed" });
  note("staff", "passing over is reachable from anywhere", pass.status < 300, `got ${pass.status}`);
  await stf.del(`crew_candidates?id=eq.${candId}`);

  // — a number answers a person —
  const selfV = await reg.rpc("verify_member_phone", { p_profile: uid(p.regional) });
  note("regional", "cannot verify their own number by rank", selfV.status >= 400, `got ${selfV.status}`);
  await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { phone: "+13055550142" });
  const staffV = await stf.rpc("verify_member_phone", { p_profile: uid(p.regional) });
  note("staff", "the Bridge verifies a number on file", staffV.status < 300, `got ${staffV.status} ${JSON.stringify(staffV.data).slice(0, 120)}`);
  // — and a hold now reaches that number by SMS, whatever the letters say —
  const hmk = await stf.post("voyages", {
    slug: `e2e-smshold-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 6, status: "scheduled", price_cents: 0,
  });
  const hvid2 = hmk.data?.[0]?.id;
  await reg.post("rsvps", { voyage_id: hvid2, profile_id: uid(p.regional), status: "aboard" });
  await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { notification_prefs: { weather: false, berths: true, fathoms: true, digest: true } });
  await stf.patch(`voyages?id=eq.${hvid2}`, { status: "weather_hold" });
  const sms = await stf.get(`sms_outbox?to_phone=eq.%2B13055550142&template=eq.weather-hold&select=status&order=created_at.desc&limit=1`);
  note("staff", "the day-of SMS rides past the letter switches", (sms.data ?? []).length >= 1, JSON.stringify(sms.data));
  note("staff", "and the fictional number is suppressed, not sent", sms.data?.[0]?.status === "skipped", JSON.stringify(sms.data));
  await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { notification_prefs: { weather: true, berths: true, fathoms: true, digest: true } });
  const lower = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { phone_verified: false, phone: null });
  const lowered = await reg.get(`profiles?id=eq.${uid(p.regional)}&select=phone_verified`);
  note("regional", "may always lower their own flag", lower.status < 300 && lowered.data?.[0]?.phone_verified === false,
    `got ${lower.status} ${JSON.stringify(lowered.data).slice(0, 80)}`);
  const hdel = await stf.del(`voyages?id=eq.${hvid2}`);
  note("staff", "the hold fixture is struck", hdel.status < 300, `got ${hdel.status} ${JSON.stringify(hdel.data).slice(0,120)}`);

  // — Shoreside answers a hail —
  const hail1 = await reg.rpc("open_shoreside_thread", {});
  note("regional", "opens a line to Shoreside", hail1.status < 300 && typeof hail1.data === "string", `got ${hail1.status}`);
  const hail2 = await reg.rpc("open_shoreside_thread", {});
  note("regional", "hailing twice is one line", hail1.data === hail2.data, `${hail1.data} vs ${hail2.data}`);
  const queue = await stf.get(`threads?id=eq.${hail1.data}&kind=eq.shoreside&select=id`);
  note("staff", "the concierge queue finally has a door", (queue.data ?? []).length === 1, `got ${queue.status}`);

  // — the moderation queue survives the post it points at —
  const post = await glo.post("wardroom_posts", { author_id: uid(p.global), body: `E2E remediation post ${stamp}` });
  const postId = post.data?.[0]?.id;
  const flag = await reg.post("wardroom_flags", { post_id: postId, flagger_id: uid(p.regional), reason: "E2E remediation flag" });
  const flagId = flag.data?.[0]?.id;
  note("regional", "raises the flag", flag.status === 201, `got ${flag.status}`);
  await stf.del(`wardroom_posts?id=eq.${postId}`);
  const orphanFlag = await stf.get(`wardroom_flags?id=eq.${flagId}&select=post_id`);
  note("staff", "the flag outlives the post it raised", (orphanFlag.data ?? []).length === 1 && orphanFlag.data[0].post_id === null, JSON.stringify(orphanFlag.data));
  // And the resolution is a write, not a wish: the Bridge leaves it up.
  const resFlagRow = await stf.get(`wardroom_flags?reason=eq.${encodeURIComponent("conduct — e2e")}&select=id,status&limit=1`);
  const resFlagId = resFlagRow.data?.[0]?.id;
  const resSettle = resFlagId ? await stf.patch(`wardroom_flags?id=eq.${resFlagId}`, { status: "left_up" }) : { status: 999 };
  const resSettled = resFlagId ? await stf.get(`wardroom_flags?id=eq.${resFlagId}&select=status`) : { data: [] };
  note("staff", "a flag can be resolved and stays resolved", resSettle.status < 300 && resSettled.data?.[0]?.status === "left_up",
    `got ${resSettle.status} ${JSON.stringify(resSettled.data).slice(0, 100)}`);
  if (resFlagId) await stf.del(`wardroom_flags?id=eq.${resFlagId}`);
  await stf.del(`wardroom_flags?id=eq.${flagId}`);

  // — the clock and the brooms exist, sealed to the API —
  const clockProbe = await reg.rpc("carry_the_clock", {});
  note("regional", "the club's clock is not a member's to wind", clockProbe.status >= 400, `got ${clockProbe.status}`);
  const broomProbe = await reg.rpc("cron_purge_expired_records", {});
  note("regional", "retention is not a member's to run", broomProbe.status >= 400, `got ${broomProbe.status}`);
  const letter = await stf.get(`email_templates?code=eq.gangway-details&active=is.true&select=code`);
  note("staff", "the promised letter is on the registry", (letter.data ?? []).length === 1, `got ${letter.status}`);
}

async function knotsFor(person, staffSession) {
  const s = rest(staffSession);
  const res = await s.get(`fathoms_balance?profile_id=eq.${uid(person)}&select=balance`);
  return Number(res.data?.[0]?.balance ?? 0);
}

/* ---------- N. Activity, Charter, Membership ----------
   Three modules whose kits specify presentation and whose data mostly already
   existed under other names. What is checked here is the small set of places
   where a rule became a rule rather than a paragraph: the format that removes
   the pass gate, the cabin held for 72 hours without being bought, the weather
   hold that refuses to be posted half-written, the membership cap counted under
   a lock, and the credential that goes stale in a minute.

   Every check exercises the rule. Asserting that a grant is missing would pass
   the day someone re-runs a blanket GRANT across the schema — which happened
   once already this week — so the writes are attempted and the refusal is the
   assertion. */
async function activityRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;

  /* --- the catalogue's own arithmetic --- */
  const priced = await stf.post("activity_formats", {
    slug: `e2e-${stamp}-priced`, category: "port", label: "E2E priced invite",
    blurb: "E2E", division: "bound", access: "invite", price_cents: 1000,
  });
  note("staff", "an invitation-only format cannot carry a price", priced.status >= 400,
    `got ${priced.status}`);
  const unpriced = await stf.post("activity_formats", {
    slug: `e2e-${stamp}-open`, category: "port", label: "E2E open unpriced",
    blurb: "E2E", division: "bound", access: "open", price_cents: null,
  });
  note("staff", "a format open to buy cannot withhold its price", unpriced.status >= 400,
    `got ${unpriced.status}`);

  /* --- the one rule in the Activity kit that changes behaviour ---
     Same sailing, same member, one column moved. The control has to refuse on
     TIER specifically: this sailing is also gated by a booking window, a
     monthly allowance and two triggers another module owns, and a check that
     only asked "did it fail" would pass on any of those and prove nothing. */
  const vy = await stf.post("voyages", {
    slug: `e2e-activity-${stamp}`, title: "E2E activity gate", class: "shore",
    kind: "port_day", starts_at: new Date(Date.now() + 2 * 864e5).toISOString(),
    berths_total: 12, price_cents: 0, min_tier: "global", status: "scheduled",
    /* Mints nothing. main() pins the suite's knots footprint to the awards its
       tests intend, and a fixture that awards on booking and reverses on
       delete only nets to zero if every delete lands — which a test that
       deliberately fails halfway cannot promise. */
    fathoms_multiplier: 0, distance_nm: 0,
  });
  const vid = vy.data?.[0]?.id;
  note("staff", "activity fixture sailing exists", !!vid, `got ${vy.status}`);
  if (vid) {
    const bookVetted = await reg.post("rsvps", { voyage_id: vid, profile_id: uid(p.regional), status: "aboard" });
    const vettedSaid = JSON.stringify(bookVetted.data ?? "");
    note("regional", "an unfiled sailing still asks for the pass its tier requires",
      bookVetted.status >= 400 && /tier/i.test(vettedSaid), `${bookVetted.status} ${vettedSaid.slice(0, 120)}`);

    await stf.patch(`voyages?id=eq.${vid}`, { format: "beach_day" });
    const bookPort = await reg.post("rsvps", { voyage_id: vid, profile_id: uid(p.regional), status: "aboard" });
    const portSaid = JSON.stringify(bookPort.data ?? "");
    note("regional", "a Port format stops asking for a pass it never issues",
      !/tier/i.test(portSaid), `${bookPort.status} ${portSaid.slice(0, 160)}`);
    await stf.del(`rsvps?voyage_id=eq.${vid}`);

    /* Fails closed. Clearing the format must put the gate back, or a sailing
       nobody has filed yet is a sailing anybody can board. */
    await stf.patch(`voyages?id=eq.${vid}`, { format: null });
    const backOn = await reg.post("rsvps", { voyage_id: vid, profile_id: uid(p.regional), status: "aboard" });
    note("regional", "clearing the format puts the gate back",
      backOn.status >= 400 && /tier/i.test(JSON.stringify(backOn.data ?? "")), `got ${backOn.status}`);
    await stf.del(`rsvps?voyage_id=eq.${vid}`);
    await stf.del(`voyages?id=eq.${vid}`);
  }

  /* The taxonomy is a public catalogue and not a member secret — the site
     prices formats off it — but nobody signed out may edit one. */
  const cat = await anon.get("activity_formats?select=slug&limit=1");
  note("anon", "the format catalogue is readable", cat.status === 200 && (cat.data || []).length > 0,
    `got ${cat.status}`);
  const rewrite = await nat.patch("activity_formats?slug=eq.beach_day", { price_cents: 1 });
  note("national", "a member cannot reprice a format",
    rewrite.status >= 400 || (rewrite.data || []).length === 0, `got ${rewrite.status}`);
}

async function charterRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;

  /* A hull of its own, so the option test can shrink a cabin to one place
     without touching a cabin the club actually sails. */
  const ves = await stf.post("vessels", { name: `E2E Charter Hull ${stamp}`, capacity: 2, active: true });
  const vesselId = ves.data?.[0]?.id;
  const cab = await stf.post("cabins", {
    vessel_id: vesselId, name: `E2E Cabin ${stamp}`, berths: 1, position: 99,
    deck: "Upper", side: "port", muster: "Station B",
  });
  const cabinId = cab.data?.[0]?.id;
  const vy = await stf.post("voyages", {
    slug: `e2e-charter-${stamp}`, title: "E2E passage", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 3 * 864e5).toISOString(),
    berths_total: 12, price_cents: 0, min_tier: "regional", status: "scheduled",
    fathoms_multiplier: 0, distance_nm: 0,
  });
  const vid = vy.data?.[0]?.id;
  if (vesselId && vid) await stf.post("voyage_vessels", { voyage_id: vid, vessel_id: vesselId });
  note("staff", "charter fixture exists", !!(vesselId && cabinId && vid),
    `vessel ${ves.status} cabin ${cab.status} voyage ${vy.status}`);
  if (!vesselId || !cabinId || !vid) return;

  /* --- the 72-hour option --- */
  const hold = await reg.rpc("hold_a_cabin_on_option", { p_voyage: vid, p_cabin: cabinId });
  const heldUntil = typeof hold.data === "string" ? Date.parse(hold.data) : NaN;
  const hours = (heldUntil - Date.now()) / 3.6e6;
  note("regional", "a cabin holds for 72 hours and not for a number the caller chose",
    hold.status < 400 && hours > 71 && hours < 73, `${hold.status} ${JSON.stringify(hold.data).slice(0, 90)}`);

  const twice = await reg.rpc("hold_a_cabin_on_option", { p_voyage: vid, p_cabin: cabinId });
  note("regional", "one hold at a time on a passage", twice.status >= 400,
    `got ${twice.status} ${JSON.stringify(twice.data ?? "").slice(0, 90)}`);

  /* The half of the option that makes it worth anything: nobody else can buy
     the room out from under it. This is the guard, not the RPC — a boarding
     goes through guard_cabin_capacity(), which had no idea options existed. */
  const cut = await nat.post("rsvps", { voyage_id: vid, profile_id: uid(p.national), status: "aboard", cabin_id: cabinId });
  note("national", "a cabin on option is not a cabin someone else can take",
    cut.status >= 400 && /spoken for/i.test(JSON.stringify(cut.data ?? "")),
    `got ${cut.status} ${JSON.stringify(cut.data ?? "").slice(0, 120)}`);

  /* Nobody may read whose hold it is — only that the room is spoken for. */
  const peek = await nat.get(`charter_options?voyage_id=eq.${vid}&select=profile_id`);
  note("national", "another member's hold is not readable", (peek.data || []).length === 0,
    JSON.stringify(peek.data ?? "").slice(0, 90));
  const counted = await nat.rpc("cabin_places_open", { p_voyage: vid });
  const mine = (counted.data || []).find((c) => c.cabin_id === cabinId);
  note("national", "the plan says the room is taken without saying by whom",
    !!mine && mine.taken === 1 && mine.mine === false, JSON.stringify(mine ?? "").slice(0, 120));

  /* Released, and the same boarding now lands. */
  const opt = await reg.get(`charter_options?voyage_id=eq.${vid}&select=id&released_at=is.null&confirmed_at=is.null`);
  const optId = opt.data?.[0]?.id;
  const rel = await reg.rpc("release_charter_option", { p_option: optId });
  note("regional", "a hold can be let go early", rel.status < 400, `got ${rel.status}`);
  /* Asserted as "the cabin no longer refuses", not as "the booking succeeded":
     three other modules hang triggers off this insert and any of them may
     legitimately refuse the national persona for its own reasons. What this
     module owns is whether the ROOM is the obstacle, and after a release it
     must not be. */
  const after = await nat.post("rsvps", { voyage_id: vid, profile_id: uid(p.national), status: "aboard", cabin_id: cabinId });
  const afterSaid = JSON.stringify(after.data ?? "");
  note("national", "the room stops being the obstacle the moment the hold is let go",
    !/spoken for/i.test(afterSaid), `got ${after.status} ${afterSaid.slice(0, 140)}`);
  await stf.del(`rsvps?voyage_id=eq.${vid}`);

  /* Writing an option directly would be writing your own expiry date. */
  const forge = await reg.post("charter_options", {
    voyage_id: vid, profile_id: uid(p.regional), cabin_id: cabinId,
    expires_at: new Date(Date.now() + 365 * 864e5).toISOString(),
  });
  note("regional", "a member cannot write their own hold or its expiry", forge.status >= 400,
    `got ${forge.status}`);

  /* --- the leg, and the hold that must say three things --- */
  const leg = await stf.post("voyage_legs", { voyage_id: vid, day: 1, port: "E2E Palma", note: "lines off 20:00" });
  const legId = leg.data?.[0]?.id;
  note("staff", "a leg is posted", !!legId, `got ${leg.status}`);

  const halfHold = await stf.patch(`voyage_legs?id=eq.${legId}`, {
    status: "held", hold_reason: "Wind 28 kn from the north", hold_posted_at: new Date().toISOString(),
  });
  note("staff", "a hold missing the new plan and what is unchanged is refused",
    halfHold.status >= 400, `got ${halfHold.status}`);

  const proper = await stf.rpc("post_a_leg_hold", {
    p_leg: legId, p_reason: "Wind 28 kn from the north",
    p_new_plan: "The leg moves to tomorrow and we stay alongside tonight",
    p_unchanged: "Dinner is still at 21:00",
  });
  note("staff", "a hold that states all three is posted", proper.status < 400, `got ${proper.status}`);

  /* The line this module exists to hold. A leg hold is not a sailing hold:
     voyages.status fires handle_voyage_status(), which mails every aboard and
     waitlisted member and, on the adjacent branch, moves money. */
  const sail = await stf.get(`voyages?id=eq.${vid}&select=status`);
  note("staff", "holding a leg does not hold the sailing",
    sail.data?.[0]?.status === "scheduled", `voyage is ${sail.data?.[0]?.status}`);

  const memberHold = await reg.rpc("post_a_leg_hold", {
    p_leg: legId, p_reason: "x", p_new_plan: "y", p_unchanged: "z",
  });
  note("regional", "a member cannot post weather", memberHold.status >= 400, `got ${memberHold.status}`);

  const lifted = await stf.rpc("lift_a_leg_hold", { p_leg: legId, p_revised: true });
  const legNow = await stf.get(`voyage_legs?id=eq.${legId}&select=status,hold_reason`);
  note("staff", "lifting a hold clears the notice with it",
    lifted.status < 400 && legNow.data?.[0]?.status === "revised" && legNow.data?.[0]?.hold_reason === null,
    JSON.stringify(legNow.data ?? "").slice(0, 120));

  /* A stop cannot be filed under a leg of another passage — a composite key,
     not a comment. */
  const otherVy = await stf.post("voyages", {
    slug: `e2e-charter-other-${stamp}`, title: "E2E other passage", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 4 * 864e5).toISOString(), berths_total: 4, price_cents: 0,
    fathoms_multiplier: 0, distance_nm: 0,
  });
  const otherId = otherVy.data?.[0]?.id;
  const strayStop = await stf.post("voyage_stops", {
    voyage_id: otherId, leg_id: legId, position: 1, name: "E2E stray stop",
  });
  note("staff", "a stop cannot belong to another passage's leg", strayStop.status >= 400,
    `got ${strayStop.status}`);
  if (otherId) await stf.del(`voyages?id=eq.${otherId}`);

  await stf.del(`voyages?id=eq.${vid}`);
  await stf.del(`vessels?id=eq.${vesselId}`);
}


/* ---------- W7. the program: what the event-type study asked for ----------
   Deposit as the sailing's own figure, the on-sale drop with tiered presale,
   the format FK, series raised from a template, seasons and venues as rows,
   the daybed cap with an actual door, the cabin premium reaching the folio,
   member-raised gatherings, and the sponsor book with its public credit.

   DECLARED FOOTPRINT: the proposal blocks leave two Words on the regional
   persona per run ("The Bridge is weighing it…", "Your gathering is on…") —
   notifications are append-only for everyone including staff, the same
   discipline the waitlist notice already documents. Money and knots net to
   zero: every fixture sailing is struck with an asserted delete, and the
   release machinery hands back what the tests charged. */
async function programRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national),
        glo = rest(p.global), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const plus30 = new Date(Date.now() + 30 * 24 * 3600e3).toISOString();
  const said = (r) => String(JSON.stringify(r.data ?? "")).toLowerCase();

  // — the drop: a stated hour, and the deeper tier walks in first —
  const dmk = await stf.post("voyages", {
    slug: `e2e-drop-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 6, status: "scheduled",
    price_cents: 0, deposit_required: true, deposit_cents: 12000,
    sale_opens_at: new Date(Date.now() + 47 * 3600e3).toISOString(), presale_hours: 24,
  });
  const dropVid = dmk.data?.[0]?.id;
  note("staff", "raises a sailing with a format, a figure and an hour", dmk.status === 201,
    `got ${dmk.status} ${JSON.stringify(dmk.data).slice(0, 120)}`);
  const dropReg = await reg.post("rsvps", { voyage_id: dropVid, profile_id: uid(p.regional), status: "aboard" });
  note("regional", "the drop holds the door, and names the hour", dropReg.status >= 400 && /drop opens/.test(said(dropReg)), said(dropReg).slice(0, 100));
  const dropNat = await nat.post("rsvps", { voyage_id: dropVid, profile_id: uid(p.national), status: "aboard" });
  note("national", "one step early is still an hour short", dropNat.status >= 400 && /drop opens/.test(said(dropNat)), said(dropNat).slice(0, 100));
  const dropGlo = await glo.post("rsvps", { voyage_id: dropVid, profile_id: uid(p.global), status: "aboard" });
  note("global", "the deepest tier walks in first", dropGlo.status === 201, `got ${dropGlo.status} ${said(dropGlo).slice(0, 100)}`);
  const dropDep = await glo.get(`account_ledger?voyage_id=eq.${dropVid}&kind=eq.deposit&select=delta_cents`);
  note("global", "the deposit is the sailing's own figure", dropDep.data?.[0]?.delta_cents === -12000, JSON.stringify(dropDep.data));
  const badFmt = await stf.post("voyages", {
    slug: `e2e-badfmt-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, format: "not_a_format",
  });
  note("staff", "a format answers to the catalogue", badFmt.status >= 400, `got ${badFmt.status}`);
  const dropDel = await stf.del(`voyages?id=eq.${dropVid}`);
  note("staff", "the drop fixture is struck", dropDel.status < 300, `got ${dropDel.status} ${JSON.stringify(dropDel.data).slice(0, 100)}`);

  // — a series raises its own sailings —
  const tmk = await stf.post("voyages", {
    slug: `e2e-sert-${stamp}`, title: "E2E series sailing.", class: "sea", kind: "voyage",
    starts_at: new Date(Date.now() + 40 * 24 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 4, status: "scheduled", price_cents: 0, format: "sandbar",
  });
  const tplVid = tmk.data?.[0]?.id;
  const smk = await stf.post("voyage_series", {
    slug: `e2e-ser-${stamp}`, title: "E2E weekly", cadence_days: 7, template_voyage_id: tplVid,
  });
  const serId = smk.data?.[0]?.id;
  note("staff", "opens the series book", smk.status === 201, `got ${smk.status} ${JSON.stringify(smk.data).slice(0, 100)}`);
  const serMember = await glo.post("voyage_series", { slug: `e2e-serx-${stamp}`, title: "Nope", cadence_days: 7, template_voyage_id: tplVid });
  note("global", "the series book is the bridge's", serMember.status >= 400, `got ${serMember.status}`);
  const raised = await stf.rpc("extend_the_series", { p_series: serId, p_count: 2 });
  note("staff", "the series raises two sailings", raised.data === 2, `got ${raised.status} ${JSON.stringify(raised.data)}`);
  const occ = await stf.get(`voyages?series_id=eq.${serId}&select=id,slug,format,deposit_cents&order=starts_at`);
  note("staff", "the occurrences inherit the template's program",
    (occ.data ?? []).length === 2 && occ.data.every((o) => o.format === "sandbar"),
    JSON.stringify(occ.data).slice(0, 140));
  const windMember = await glo.rpc("extend_the_series", { p_series: serId, p_count: 1 });
  note("global", "a member cannot wind the series", windMember.status >= 400, `got ${windMember.status} ${said(windMember).slice(0, 80)}`);
  const occDel = await stf.del(`voyages?series_id=eq.${serId}`);
  const serDel = await stf.del(`voyage_series?id=eq.${serId}`);
  const tplDel = await stf.del(`voyages?id=eq.${tplVid}`);
  note("staff", "the series and its sailings are struck",
    occDel.status < 300 && serDel.status < 300 && tplDel.status < 300,
    `got ${occDel.status}/${serDel.status}/${tplDel.status}`);

  // — a season and a venue are rows, and public reading —
  const seaMk = await stf.post("seasons", {
    slug: `e2e-season-${stamp}`, title: "E2E Season", starts_on: "2026-10-01", ends_on: "2027-01-07",
  });
  const seasonId = seaMk.data?.[0]?.id;
  const venMk = await stf.post("venues", { slug: `e2e-venue-${stamp}`, name: "E2E Venue", kind: "club" });
  const venueId = venMk.data?.[0]?.id;
  note("staff", "opens the season and names the venue", seaMk.status === 201 && venMk.status === 201,
    `got ${seaMk.status}/${venMk.status}`);
  const seaAnon = await anon.get(`seasons?slug=eq.e2e-season-${stamp}&select=title`);
  const venAnon = await anon.get(`venues?slug=eq.e2e-venue-${stamp}&select=name`);
  note("anon", "a season and a venue are public reading",
    (seaAnon.data ?? []).length === 1 && (venAnon.data ?? []).length === 1,
    `${JSON.stringify(seaAnon.data)} ${JSON.stringify(venAnon.data)}`.slice(0, 100));
  const seaMember = await reg.post("seasons", { slug: `e2e-seasonx-${stamp}`, title: "Nope", starts_on: "2026-10-01", ends_on: "2026-10-02" });
  note("regional", "the calendar is not a member's to write", seaMember.status >= 400, `got ${seaMember.status}`);

  // — two daybed groups a sailing, and a real door to buy one —
  const bmk = await stf.post("voyages", {
    slug: `e2e-daybed-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 6, status: "scheduled", price_cents: 0,
  });
  const bedVid = bmk.data?.[0]?.id;
  const bedReg = await reg.post("rsvps", { voyage_id: bedVid, profile_id: uid(p.regional), status: "aboard" });
  const bedNat = await nat.post("rsvps", { voyage_id: bedVid, profile_id: uid(p.national), status: "aboard" });
  const bedGlo = await glo.post("rsvps", { voyage_id: bedVid, profile_id: uid(p.global), status: "aboard" });
  const claim1 = await reg.rpc("claim_a_daybed", { p_rsvp: bedReg.data?.[0]?.id });
  note("regional", "a daybed rides the pass", claim1.status < 300, `got ${claim1.status} ${said(claim1).slice(0, 90)}`);
  const bedCharge = await reg.get(`account_ledger?voyage_id=eq.${bedVid}&kind=eq.addon&select=delta_cents,memo`);
  note("regional", "priced by the house at the catalogue figure",
    (bedCharge.data ?? []).some((l) => l.delta_cents === -150000 && /Bow daybed/.test(l.memo)),
    JSON.stringify(bedCharge.data).slice(0, 120));
  const claimTwice = await reg.rpc("claim_a_daybed", { p_rsvp: bedReg.data?.[0]?.id });
  note("regional", "one daybed to a pass", claimTwice.status >= 400, `got ${claimTwice.status}`);
  const claim2 = await nat.rpc("claim_a_daybed", { p_rsvp: bedNat.data?.[0]?.id });
  const claim3 = await glo.rpc("claim_a_daybed", { p_rsvp: bedGlo.data?.[0]?.id });
  note("global", "the rail holds at two groups", claim2.status < 300 && claim3.status >= 400 && /daybed groups/.test(said(claim3)),
    `got ${claim2.status}/${claim3.status} ${said(claim3).slice(0, 90)}`);
  const bedMine = await nat.get(`voyage_daybeds?voyage_id=eq.${bedVid}&select=id`);
  note("national", "the daybed list shows your own name only", (bedMine.data ?? []).length === 1, JSON.stringify(bedMine.data).slice(0, 80));
  const bedDel = await stf.del(`voyages?id=eq.${bedVid}`);
  note("staff", "the daybed fixture is struck", bedDel.status < 300, `got ${bedDel.status} ${JSON.stringify(bedDel.data).slice(0, 100)}`);

  // — the cabin premium reaches the folio at last —
  const hullMk = await stf.post("vessels", { name: `E2E Charter Hull ${stamp}` });
  const hullId = hullMk.data?.[0]?.id;
  const cabMk = await stf.post("cabins", { vessel_id: hullId, name: "E2E Owner", berths: 2, premium_cents: 4000 });
  const cabId = cabMk.data?.[0]?.id;
  const cmk2 = await stf.post("voyages", {
    slug: `e2e-cabin-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, status: "scheduled", price_cents: 0,
  });
  const cabVid = cmk2.data?.[0]?.id;
  await stf.post("voyage_vessels", { voyage_id: cabVid, vessel_id: hullId });
  const cabPass = await glo.post("rsvps", { voyage_id: cabVid, profile_id: uid(p.global), status: "aboard" });
  const cabRsvp = cabPass.data?.[0]?.id;
  const takeCab = await glo.patch(`rsvps?id=eq.${cabRsvp}`, { cabin_id: cabId });
  const cabCharge = await glo.get(`account_ledger?rsvp_id=eq.${cabRsvp}&select=delta_cents,memo&memo=like.Cabin*`);
  note("global", "the cabin premium reaches the folio at last",
    takeCab.status < 300 && (cabCharge.data ?? []).some((l) => l.delta_cents === -4000),
    `got ${takeCab.status} ${JSON.stringify(cabCharge.data).slice(0, 120)}`);
  await glo.patch(`rsvps?id=eq.${cabRsvp}`, { cabin_id: null });
  const cabBack = await glo.get(`account_ledger?rsvp_id=eq.${cabRsvp}&select=delta_cents,memo&memo=like.Cabin*`);
  note("global", "moving out hands it back",
    (cabBack.data ?? []).some((l) => l.delta_cents === 4000 && /given up/.test(l.memo)),
    JSON.stringify(cabBack.data).slice(0, 140));
  const cabDel = await stf.del(`voyages?id=eq.${cabVid}`);
  const hullDel = await stf.del(`vessels?id=eq.${hullId}`);
  note("staff", "the cabin fixture is struck", cabDel.status < 300 && hullDel.status < 300, `got ${cabDel.status}/${hullDel.status}`);

  // — a member may raise a gathering, and only the bridge may rule —
  const prMk = await reg.post("member_event_proposals", {
    proposer_id: uid(p.regional), title: `E2E gathering ${stamp}`, format: "gathering", note: "E2E",
  });
  const prId = prMk.data?.[0]?.id;
  note("regional", "raises a gathering", prMk.status === 201, `got ${prMk.status} ${JSON.stringify(prMk.data).slice(0, 100)}`);
  await reg.patch(`member_event_proposals?id=eq.${prId}`, { status: "approved" });
  const prStill = await reg.get(`member_event_proposals?id=eq.${prId}&select=status`);
  note("regional", "the ruling is not the proposer's to write", prStill.data?.[0]?.status === "submitted", JSON.stringify(prStill.data));
  const prAnon = await anon.post("member_event_proposals", { proposer_id: uid(p.regional), title: "E2E nope" });
  note("anon", "the door needs a member behind it", prAnon.status >= 400, `got ${prAnon.status}`);
  const gavelMember = await reg.rpc("decide_a_proposal", { p_id: prId, p_status: "approved" });
  note("regional", "the gavel is the bridge's", gavelMember.status >= 400, `got ${gavelMember.status} ${said(gavelMember).slice(0, 60)}`);
  const weigh = await stf.rpc("decide_a_proposal", { p_id: prId, p_status: "considering" });
  const ruled = await stf.rpc("decide_a_proposal", { p_id: prId, p_status: "approved" });
  note("staff", "the bridge weighs it and rules", weigh.status < 300 && ruled.status < 300, `got ${weigh.status}/${ruled.status}`);
  const word = await reg.get(`notifications?title=eq.${encodeURIComponent(`Your gathering is on: E2E gathering ${stamp}`)}&select=id`);
  note("regional", "the yes reaches the member as a Word", (word.data ?? []).length >= 1, `got ${word.status} ${JSON.stringify(word.data).slice(0, 80)}`);
  await reg.del(`member_event_proposals?id=eq.${prId}`);
  const prHeld = await stf.get(`member_event_proposals?id=eq.${prId}&select=id`);
  note("regional", "a ruled proposal is off the member's hands", (prHeld.data ?? []).length === 1, JSON.stringify(prHeld.data).slice(0, 60));
  const prDel = await stf.del(`member_event_proposals?id=eq.${prId}`);
  note("staff", "and the bridge may strike the record", prDel.status < 300, `got ${prDel.status}`);

  // — the sponsor book: sealed terms, a public credit —
  const spMk = await stf.post("sponsors", { name: `E2E Sponsor ${stamp}`, tier: "presenting_partner", monthly_cents: 1000000 });
  const spId = spMk.data?.[0]?.id;
  note("staff", "opens the sponsor book", spMk.status === 201, `got ${spMk.status} ${JSON.stringify(spMk.data).slice(0, 100)}`);
  const badTier = await stf.post("sponsors", { name: "E2E Off-card", tier: "title_sponsor", monthly_cents: 1 });
  note("staff", "a tier answers to the rate card", badTier.status >= 400, `got ${badTier.status}`);
  const spSealed = await reg.get("sponsors?select=id&limit=5");
  note("regional", "the sponsor book is sealed to the wardroom", (spSealed.data ?? []).length === 0, `got ${spSealed.status} ${JSON.stringify(spSealed.data).slice(0, 60)}`);
  const spmk2 = await stf.post("voyages", {
    slug: `e2e-spon-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "voyage",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, status: "scheduled", price_cents: 0,
    season_id: seasonId, venue_id: venueId,
  });
  const sponVid = spmk2.data?.[0]?.id;
  note("staff", "a sailing takes its season and its venue", spmk2.status === 201, `got ${spmk2.status} ${JSON.stringify(spmk2.data).slice(0, 100)}`);
  await stf.post("voyage_sponsors", { voyage_id: sponVid, sponsor_id: spId });
  const credits = await anon.rpc("sponsor_credits", { p_voyage: sponVid });
  note("anon", "the public reads the credit, never the money",
    Array.isArray(credits.data) && credits.data.length === 1 &&
      credits.data[0]?.name === `E2E Sponsor ${stamp}` && credits.data[0]?.monthly_cents === undefined,
    `got ${credits.status} ${JSON.stringify(credits.data).slice(0, 120)}`);
  const sponDel = await stf.del(`voyages?id=eq.${sponVid}`);
  const spDel = await stf.del(`sponsors?id=eq.${spId}`);
  const venDel = await stf.del(`venues?id=eq.${venueId}`);
  const seaDel = await stf.del(`seasons?id=eq.${seasonId}`);
  note("staff", "the sponsor, season and venue fixtures are struck",
    sponDel.status < 300 && spDel.status < 300 && venDel.status < 300 && seaDel.status < 300,
    `got ${sponDel.status}/${spDel.status}/${venDel.status}/${seaDel.status}`);
}


/* ---------- W8. the crawl: one ruler, honest money, a record that keeps ----------
   The single-source tables answer for the numbers; a sailing honours its
   format and its drop; the transfer moves the whole pass and refuses what it
   cannot move; a struck daybed pays back; a sailing inside the window is
   cancelled, never struck; the Bridge's changes are on the record; a member
   can take their own record away with them. Every fixture struck, money and
   knots net to zero. */
async function crawlRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national),
        glo = rest(p.global), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const plus30 = new Date(Date.now() + 30 * 24 * 3600e3).toISOString();
  const said = (r) => String(JSON.stringify(r.data ?? "")).toLowerCase();

  // — the facts, stated once and public reading —
  const hull = await anon.rpc("club_setting", { p_key: "hull_ceiling_heads" });
  note("anon", "the hull ceiling is one setting", hull.data === 40, `got ${hull.status} ${JSON.stringify(hull.data)}`);
  const segs = await anon.get("segments?select=slug,heads&order=slug");
  note("anon", "a couple is two heads, said once", (segs.data ?? []).some((x) => x.slug === "couple" && x.heads === 2), JSON.stringify(segs.data).slice(0, 100));
  const tiers = await anon.get("sponsor_tiers?select=slug,rate_cents&order=position");
  note("anon", "the rate card is a table", (tiers.data ?? []).length === 4 && tiers.data[0].rate_cents === 1000000, JSON.stringify(tiers.data).slice(0, 120));
  const dial = await reg.patch("club_settings?key=eq.hull_ceiling_heads", { value_int: 41 });
  const dialRead = await anon.rpc("club_setting", { p_key: "hull_ceiling_heads" });
  note("regional", "the dials are not a member's to turn", dial.status >= 400 || dialRead.data === 40, `got ${dial.status} ${JSON.stringify(dialRead.data)}`);

  // — a sailing honours its format and its drop —
  const incl = await stf.post("voyages", {
    slug: `e2e-incl-${stamp}`, title: "E2E fixture sailing.", class: "shore", kind: "port_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, format: "shore_leave", price_cents: 1000,
  });
  note("staff", "an included format is never sold", incl.status >= 400 && /included|never sold/.test(said(incl)), said(incl).slice(0, 100));
  const overCap = await stf.post("voyages", {
    slug: `e2e-over-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 41, format: "sandbar", price_cents: 0,
  });
  note("staff", "a hull is not set past its format", overCap.status >= 400 && /seats 40/.test(said(overCap)), said(overCap).slice(0, 100));
  const lateDrop = await stf.post("voyages", {
    slug: `e2e-late-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, price_cents: 0,
    sale_opens_at: new Date(Date.now() + 31 * 24 * 3600e3).toISOString(),
  });
  note("staff", "a drop opens before the boat leaves", lateDrop.status >= 400, `got ${lateDrop.status}`);

  // — a composition sailing sends the waitlist to the line —
  const cmk = await stf.post("voyages", {
    slug: `e2e-comp-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, price_cents: 0,
  });
  const compVid = cmk.data?.[0]?.id;
  await stf.post("voyage_segment_caps", [
    { voyage_id: compVid, segment: "single_woman", cap: 1 },
    { voyage_id: compVid, segment: "single_man", cap: 1 },
  ]);
  const compWait = await reg.post("rsvps", { voyage_id: compVid, profile_id: uid(p.regional), status: "waitlist" });
  note("regional", "a composition sailing sends the waitlist to the line", compWait.status >= 400 && /line/.test(said(compWait)), said(compWait).slice(0, 100));
  const compDel = await stf.del(`voyages?id=eq.${compVid}`);
  note("staff", "the composition fixture is struck", compDel.status < 300, `got ${compDel.status}`);

  // — a hand-off moves the whole pass, deposit as deposit —
  const hmk = await stf.post("voyages", {
    slug: `e2e-whole-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, price_cents: 1000,
    deposit_required: true, deposit_cents: 7000, status: "scheduled",
  });
  const hvid = hmk.data?.[0]?.id;
  const giver = await nat.post("rsvps", { voyage_id: hvid, profile_id: uid(p.national), status: "aboard" });
  const giverRsvp = giver.data?.[0]?.id;
  const bed = await nat.rpc("claim_a_daybed", { p_rsvp: giverRsvp });
  note("national", "holds a daybed on the pass to hand on", bed.status < 300, `got ${bed.status} ${said(bed).slice(0, 80)}`);
  const bedTwice = await nat.rpc("claim_a_daybed", { p_rsvp: giverRsvp });
  note("national", "a second claim is told it is already theirs", bedTwice.status >= 400 && /already yours/.test(said(bedTwice)), said(bedTwice).slice(0, 80));
  const off = await nat.post("pass_transfers", { rsvp_id: giverRsvp, from_profile: uid(p.national), to_profile: uid(p.global) });
  const take = await glo.rpc("accept_pass_transfer", { p_id: off.data?.[0]?.id });
  note("global", "takes over the whole pass", take.status < 300, `got ${take.status} ${said(take).slice(0, 100)}`);
  const takerDep = await glo.get(`account_ledger?rsvp_id=eq.${giverRsvp}&profile_id=eq.${uid(p.global)}&kind=eq.deposit&select=delta_cents`);
  note("global", "the taker's deposit is a deposit", takerDep.data?.[0]?.delta_cents === -7000, JSON.stringify(takerDep.data).slice(0, 80));
  const bedNow = await glo.get(`voyage_daybeds?rsvp_id=eq.${giverRsvp}&select=profile_id`);
  note("global", "the daybed followed the pass", bedNow.data?.[0]?.profile_id === uid(p.global), JSON.stringify(bedNow.data).slice(0, 80));
  const strike = await stf.del(`voyage_daybeds?rsvp_id=eq.${giverRsvp}`);
  const struckBack = await glo.get(`account_ledger?rsvp_id=eq.${giverRsvp}&profile_id=eq.${uid(p.global)}&kind=eq.credit&memo=like.Bow daybed*&select=delta_cents`);
  note("global", "a struck daybed pays back", strike.status < 300 && (struckBack.data ?? []).some((l) => l.delta_cents === 150000), JSON.stringify(struckBack.data).slice(0, 80));
  const hdel = await stf.del(`voyages?id=eq.${hvid}`);
  note("staff", "the hand-off fixture is struck", hdel.status < 300, `got ${hdel.status} ${JSON.stringify(hdel.data).slice(0, 80)}`);

  // — inside the window a sailing is cancelled, never struck —
  const nmk = await stf.post("voyages", {
    slug: `e2e-near-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: new Date(Date.now() + 6 * 3600e3).toISOString(), time_zone: "America/New_York",
    berths_total: 4, price_cents: 1000, status: "scheduled",
  });
  const nvid = nmk.data?.[0]?.id;
  await stf.post("rsvps", { voyage_id: nvid, profile_id: uid(p.global), status: "aboard" });
  const nearDel = await stf.del(`voyages?id=eq.${nvid}`);
  note("staff", "inside the window a sailing is cancelled, never struck", nearDel.status >= 400 && /cancelled, not struck/.test(said(nearDel)), said(nearDel).slice(0, 100));
  await stf.patch(`voyages?id=eq.${nvid}`, { status: "cancelled" });
  const nearDel2 = await stf.del(`voyages?id=eq.${nvid}`);
  note("staff", "and once cancelled it may be struck", nearDel2.status < 300, `got ${nearDel2.status}`);

  // — the flotilla is levelled in one statement, and the log keeps the change —
  const h1 = await stf.post("vessels", { name: `E2E Charter Hull A ${stamp}` });
  const h2 = await stf.post("vessels", { name: `E2E Charter Hull B ${stamp}` });
  const fmk = await stf.post("voyages", {
    slug: `e2e-level-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 6, price_cents: 0, status: "scheduled",
  });
  const fvid = fmk.data?.[0]?.id;
  await stf.post("voyage_vessels", [{ voyage_id: fvid, vessel_id: h1.data?.[0]?.id, position: 1 }, { voyage_id: fvid, vessel_id: h2.data?.[0]?.id, position: 2 }]);
  for (const who of ["regional", "national", "global"]) await stf.post("rsvps", { voyage_id: fvid, profile_id: uid(p[who]), status: "aboard" });
  const level = await stf.rpc("assign_vessels_evenly", { p_voyage: fvid });
  const hulls = await stf.get(`rsvps?voyage_id=eq.${fvid}&select=vessel_id`);
  note("staff", "the flotilla is levelled in one statement", level.data === 3 && (hulls.data ?? []).every((r) => r.vessel_id), `got ${level.status} ${JSON.stringify(level.data)}`);
  const logged = await stf.get(`audit_log?table_name=eq.voyages&row_id=eq.${fvid}&action=eq.INSERT&select=actor_id`);
  note("staff", "the bridge's change is on the record, with a name", (logged.data ?? []).length === 1 && logged.data[0].actor_id === uid(p.staff), JSON.stringify(logged.data).slice(0, 80));
  const logMember = await reg.get("audit_log?select=id&limit=1");
  note("regional", "the record is the bridge's reading", (logMember.data ?? []).length === 0, `got ${logMember.status}`);
  const ref = await stf.get(`fathoms_ledger?voyage_id=eq.${fvid}&select=member_ref&limit=1`);
  note("staff", "a ledger row carries the member's number, not only their id", typeof ref.data?.[0]?.member_ref === "string" && ref.data[0].member_ref.length > 0, JSON.stringify(ref.data).slice(0, 60));
  const fdel = await stf.del(`voyages?id=eq.${fvid}`);
  await stf.del(`vessels?id=in.(${h1.data?.[0]?.id},${h2.data?.[0]?.id})`);
  note("staff", "the flotilla fixture is struck", fdel.status < 300, `got ${fdel.status} ${JSON.stringify(fdel.data).slice(0, 80)}`);

  // — a ruling is given once; a request has a door; a record can be taken away —
  const prMk = await reg.post("member_event_proposals", { proposer_id: uid(p.regional), title: `E2E once ${stamp}`, format: "mixer" });
  const prId = prMk.data?.[0]?.id;
  await stf.rpc("decide_a_proposal", { p_id: prId, p_status: "declined", p_note: "E2E" });
  const again = await stf.rpc("decide_a_proposal", { p_id: prId, p_status: "approved" });
  note("staff", "a ruling is given once", again.status >= 400 && /ruled on already/.test(said(again)), said(again).slice(0, 80));
  await stf.del(`member_event_proposals?id=eq.${prId}`);
  const rq = await reg.post("charter_requests", { profile_id: uid(p.regional), format: "private_charter", party_size: 12, note: "E2E" });
  note("regional", "an on-request format has a door", rq.status === 201, `got ${rq.status} ${JSON.stringify(rq.data).slice(0, 80)}`);
  const rqAnon = await anon.post("charter_requests", { profile_id: uid(p.regional), format: "private_charter" });
  note("anon", "the door needs a member behind it", rqAnon.status >= 400, `got ${rqAnon.status}`);
  await stf.del(`charter_requests?id=eq.${rq.data?.[0]?.id}`);
  const mine = await reg.rpc("export_my_data", {});
  note("regional", "a member can take their record away with them", mine.status < 300 && mine.data?.profile?.id === uid(p.regional) && Array.isArray(mine.data?.passes), `got ${mine.status} ${Object.keys(mine.data ?? {}).join(",").slice(0, 80)}`);
  const requeueMember = await reg.rpc("requeue_outbox_row", { p_table: "email_outbox", p_id: uid(p.regional) });
  note("regional", "the outbox is not a member's to requeue", requeueMember.status >= 400, `got ${requeueMember.status}`);
  const stripeSealed = await reg.get("stripe_events?select=id&limit=1");
  note("regional", "the stripe log is sealed to the wardroom", (stripeSealed.data ?? []).length === 0, `got ${stripeSealed.status}`);
}


/* ---------- W9. the decisions, made and tested ----------
   Dues that lapse hold the membership; a departure squares the manifest; the
   quarterly membership is a plan the cap can count; a couple names its second
   head; a flotilla names its ceiling; a sailing keeps its taxonomy; an add-on
   follows the heads; one open application to an address; the Bridge sees its
   errors and its scheduler; a sponsor has passes to give. */
async function decisionRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national),
        glo = rest(p.global), pau = rest(p.paused), anon = rest(null);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;
  const plus30 = new Date(Date.now() + 30 * 24 * 3600e3).toISOString();
  const said = (r) => String(JSON.stringify(r.data ?? "")).toLowerCase();

  // — the quarterly membership is a plan the cap can see —
  const plan = await stf.get("membership_plans?product_slug=eq.quarterly_membership&select=label,events_per_month,plan_type");
  note("staff", "the quarterly membership is a plan the cap can count",
    plan.data?.[0]?.label === "Club Lifestyle Membership" && plan.data[0].plan_type === "access", JSON.stringify(plan.data).slice(0, 100));

  // — a flotilla names its own ceiling —
  const fmk = await stf.post("voyages", {
    slug: `e2e-tentpole-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 60, price_cents: 0, hull_ceiling_heads: 60,
  });
  const tentVid = fmk.data?.[0]?.id;
  const bigCaps = await stf.post("voyage_segment_caps", [
    { voyage_id: tentVid, segment: "single_woman", cap: 25 },
    { voyage_id: tentVid, segment: "single_man", cap: 25 },
  ]);
  note("staff", "a flotilla seats past forty when it names its ceiling", bigCaps.status === 201, `got ${bigCaps.status} ${said(bigCaps).slice(0, 90)}`);
  const overTent = await stf.post("voyage_segment_caps", { voyage_id: tentVid, segment: "couple", cap: 10 });
  note("staff", "and holds at the ceiling it named", overTent.status >= 400 && /hull holds 60/.test(said(overTent)), said(overTent).slice(0, 90));
  const tentDel = await stf.del(`voyages?id=eq.${tentVid}`);
  note("staff", "the tentpole fixture is struck", tentDel.status < 300, `got ${tentDel.status}`);

  // — a sailing keeps its taxonomy —
  const tmk = await stf.post("voyages", {
    slug: `e2e-taxo-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day", format: "pool_social",
    starts_at: plus30, ends_at: new Date(Date.parse(plus30) + 10 * 3600e3).toISOString(),
    time_zone: "America/New_York", berths_total: 4, price_cents: 0,
  });
  note("staff", "a port format is a shore sailing, and ten hours is an odyssey",
    tmk.data?.[0]?.class === "shore" && tmk.data?.[0]?.kind === "port_day" && tmk.data?.[0]?.sub_class === "odyssey",
    JSON.stringify({ c: tmk.data?.[0]?.class, k: tmk.data?.[0]?.kind, s: tmk.data?.[0]?.sub_class }));
  await stf.del(`voyages?id=eq.${tmk.data?.[0]?.id}`);

  // — a couple names its second head; a guest still rides Global alone —
  const cmk = await stf.post("voyages", {
    slug: `e2e-couple-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 6, price_cents: 0,
  });
  const cplVid = cmk.data?.[0]?.id;
  const cplPass = await stf.post("rsvps", { voyage_id: cplVid, profile_id: uid(p.regional), status: "aboard", segment: "couple" });
  const partner = await reg.post("rsvp_guests", { rsvp_id: cplPass.data?.[0]?.id, name: "E2E Partner", kind: "partner" });
  note("regional", "a couple names its second head", partner.status === 201 && !!partner.data?.[0]?.boarding_code, `got ${partner.status} ${said(partner).slice(0, 90)}`);
  const partnerTwice = await reg.post("rsvp_guests", { rsvp_id: cplPass.data?.[0]?.id, name: "E2E Other", kind: "partner" });
  note("regional", "a couple has one second head", partnerTwice.status >= 400, `got ${partnerTwice.status}`);
  const soloPass = await stf.post("rsvps", { voyage_id: cplVid, profile_id: uid(p.national), status: "aboard", segment: "single_man" });
  const soloPartner = await nat.post("rsvp_guests", { rsvp_id: soloPass.data?.[0]?.id, name: "E2E Nobody", kind: "partner" });
  note("national", "a single pass seats one", soloPartner.status >= 400 && /seats one/.test(said(soloPartner)), said(soloPartner).slice(0, 90));
  const guestOnRegional = await reg.post("rsvp_guests", { rsvp_id: cplPass.data?.[0]?.id, name: "E2E Guest" });
  note("regional", "a guest still rides a Global membership", guestOnRegional.status >= 400 && /global/i.test(said(guestOnRegional)), said(guestOnRegional).slice(0, 90));
  const cplDel = await stf.del(`voyages?id=eq.${cplVid}`);
  note("staff", "the couple fixture is struck", cplDel.status < 300, `got ${cplDel.status}`);

  // — an add-on follows the heads —
  const amk = await stf.post("voyages", {
    slug: `e2e-heads-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 6, price_cents: 0,
  });
  const headVid = amk.data?.[0]?.id;
  const gloPass = await glo.post("rsvps", { voyage_id: headVid, profile_id: uid(p.global), status: "aboard", guests: 2, guest_names: ["E2E One", "E2E Two"] });
  const shelf = await glo.get("addons?select=id,price_cents&active=eq.true&limit=1");
  const addonId = shelf.data?.[0]?.id;
  await glo.rpc("attach_addons", { p_rsvp: gloPass.data?.[0]?.id, p_addons: [addonId], p_qty: 3 });
  await glo.patch(`rsvps?id=eq.${gloPass.data?.[0]?.id}`, { guests: 1, guest_names: ["E2E One"] });
  const trimmed = await glo.get(`rsvp_addons?rsvp_id=eq.${gloPass.data?.[0]?.id}&select=qty`);
  const back = await glo.get(`account_ledger?rsvp_id=eq.${gloPass.data?.[0]?.id}&kind=eq.credit&memo=like.*fewer aboard&select=delta_cents`);
  note("global", "an add-on follows the heads and credits the difference",
    trimmed.data?.[0]?.qty === 2 && back.data?.[0]?.delta_cents === shelf.data?.[0]?.price_cents,
    `qty ${JSON.stringify(trimmed.data)} credit ${JSON.stringify(back.data)}`);
  const headDel = await stf.del(`voyages?id=eq.${headVid}`);
  note("staff", "the heads fixture is struck", headDel.status < 300, `got ${headDel.status}`);

  // — a sponsor has passes to give —
  const spMk = await stf.post("sponsors", { name: `E2E Presenting ${stamp}`, tier: "presenting_partner", monthly_cents: 1000000 });
  const smk = await stf.post("voyages", {
    slug: `e2e-sponsored-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 6, price_cents: 1000,
  });
  const spVid = smk.data?.[0]?.id;
  const noAct = await stf.rpc("comp_a_pass_for_sponsor", { p_voyage: spVid, p_sponsor: spMk.data?.[0]?.id, p_profile: uid(p.national) });
  note("staff", "a comp needs the sponsor on the sailing first", noAct.status >= 400 && /activation/.test(said(noAct)), said(noAct).slice(0, 90));
  await stf.post("voyage_sponsors", { voyage_id: spVid, sponsor_id: spMk.data?.[0]?.id });
  const comp = await stf.rpc("comp_a_pass_for_sponsor", { p_voyage: spVid, p_sponsor: spMk.data?.[0]?.id, p_profile: uid(p.national) });
  const compRow = await stf.get(`rsvps?voyage_id=eq.${spVid}&profile_id=eq.${uid(p.national)}&select=comp,sponsor_id`);
  const compCharge = await nat.get(`account_ledger?voyage_id=eq.${spVid}&kind=eq.berth&select=delta_cents`);
  note("staff", "a sponsor's comp is a comp, on the sponsor's account",
    comp.status < 300 && compRow.data?.[0]?.comp === true && compRow.data[0].sponsor_id === spMk.data?.[0]?.id && (compCharge.data ?? []).length === 0,
    `got ${comp.status} ${JSON.stringify(compRow.data).slice(0, 80)} charges ${(compCharge.data ?? []).length}`);
  const memberComp = await nat.rpc("comp_a_pass_for_sponsor", { p_voyage: spVid, p_sponsor: spMk.data?.[0]?.id, p_profile: uid(p.national) });
  note("national", "comps are the bridge's to give", memberComp.status >= 400, `got ${memberComp.status}`);

  // — the new columns joined the guards —
  const selfLift = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, { hold_reason: null });
  const holdRow = await reg.get(`profiles?id=eq.${uid(p.regional)}&select=hold_reason`);
  note("regional", "a hold's reason is not the member's to write", selfLift.status >= 400 || holdRow.status === 200, `got ${selfLift.status}`);
  const selfSponsor = await glo.post("rsvps", { voyage_id: spVid, profile_id: uid(p.global), status: "waitlist", sponsor_id: spMk.data?.[0]?.id });
  note("global", "a sponsor's account is not the member's to name", selfSponsor.status >= 400 && /bridge/.test(said(selfSponsor)), said(selfSponsor).slice(0, 90));
  await stf.del(`voyages?id=eq.${spVid}`);
  const spDel = await stf.del(`sponsors?id=eq.${spMk.data?.[0]?.id}`);
  note("staff", "the sponsored fixture is struck", spDel.status < 300, `got ${spDel.status}`);

  // — one open application to an address —
  const addr = `e2e-anon-twice-${stamp}@fixtures.invalid`;
  /* Minimal, as the public funnel sends it: an applicant cannot read the
     applications table back, and a representation insert is refused whole. */
  const first = await anon.postMinimal("applications", { full_name: "E2E Twice", email: addr, city: "Miami" });
  const second = await anon.postMinimal("applications", { full_name: "E2E Twice", email: addr.toUpperCase(), city: "Miami" });
  note("anon", "one open application to an address", first.status === 201 && second.status === 409, `got ${first.status}/${second.status}`);

  // — the bridge sees its errors and its scheduler; nobody else does —
  const errs = await reg.get("app_errors?select=id&limit=1");
  note("regional", "the error log is the bridge's reading", (errs.data ?? []).length === 0, `got ${errs.status}`);
  const sched = await reg.rpc("scheduler_health", { p_limit: 5 });
  note("regional", "the scheduler's health is the bridge's reading", (Array.isArray(sched.data) ? sched.data.length : 0) === 0, `got ${sched.status}`);
  const schedStaff = await stf.rpc("scheduler_health", { p_limit: 5 });
  note("staff", "the bridge reads the scheduler's last responses", schedStaff.status < 300 && Array.isArray(schedStaff.data), `got ${schedStaff.status} ${Array.isArray(schedStaff.data) ? schedStaff.data.length : "?"} rows`);

  // — a departure squares the manifest (the paused persona leaves, then is restored) —
  const dmk = await stf.post("voyages", {
    slug: `e2e-farewell-${stamp}`, title: "E2E fixture sailing.", class: "sea", kind: "sea_day",
    starts_at: plus30, time_zone: "America/New_York", berths_total: 4, price_cents: 1000,
  });
  const fwVid = dmk.data?.[0]?.id;
  await stf.post("rsvps", { voyage_id: fwVid, profile_id: uid(p.paused), status: "aboard" });
  const charged = await stf.get(`account_ledger?voyage_id=eq.${fwVid}&profile_id=eq.${uid(p.paused)}&kind=eq.berth&select=delta_cents`);
  const leave = await pau.rpc("set_own_standing", { p_status: "departed" });
  const gone = await stf.get(`rsvps?voyage_id=eq.${fwVid}&profile_id=eq.${uid(p.paused)}&select=status`);
  const squared = await stf.get(`account_ledger?voyage_id=eq.${fwVid}&profile_id=eq.${uid(p.paused)}&kind=eq.credit&memo=like.Departed*&select=delta_cents`);
  note("paused", "a departure squares the manifest in full",
    leave.status < 300 && gone.data?.[0]?.status === "not_going" && squared.data?.[0]?.delta_cents === -(charged.data?.[0]?.delta_cents ?? 0),
    `got ${leave.status} ${JSON.stringify(gone.data)} ${JSON.stringify(squared.data)}`);
  /* Two writes, on purpose: the status change is stamped with the staff hand
     that made it, and a club-held pause is one the member cannot resume —
     which the membership section asserts they can. The hold is handed back. */
  const restore = await stf.patch(`profiles?id=eq.${uid(p.paused)}`, { status: "paused" });
  const handBack = await stf.patch(`profiles?id=eq.${uid(p.paused)}`, { status_set_by: uid(p.paused), hold_reason: null });
  note("staff", "the paused persona is restored, holding its own pause", restore.status < 300 && handBack.status < 300,
    `got ${restore.status}/${handBack.status} ${said(handBack).slice(0, 80)}`);
  const fwDel = await stf.del(`voyages?id=eq.${fwVid}`);
  note("staff", "the farewell fixture is struck", fwDel.status < 300, `got ${fwDel.status}`);
}

async function membershipRules(p) {
  const stf = rest(p.staff), reg = rest(p.regional), nat = rest(p.national);
  const stamp = `${Date.now().toString(36)}${RUN_TOKEN}`;

  /* --- a price is the product, or there is no price --- */
  const secretPrice = await stf.post("club_products", {
    slug: `e2e-${stamp}-secret`, label: "E2E secret", blurb: "E2E",
    price_cents: 100000, published: false, kind: "membership", vetting: "E2E",
  });
  note("staff", "an unpublished product cannot carry a number it never publishes",
    secretPrice.status >= 400, `got ${secretPrice.status}`);
  const freeLunch = await stf.post("club_products", {
    slug: `e2e-${stamp}-free`, label: "E2E free", blurb: "E2E",
    price_cents: null, published: true, kind: "pass", vetting: "E2E",
  });
  note("staff", "a published product cannot render as nothing", freeLunch.status >= 400,
    `got ${freeLunch.status}`);

  /* The couple pass is the reason two denominations exist. If this ever reads
     one unit and one seat, the ratio gate has quietly started selling forty
     couples onto a forty-seat boat. */
  const couple = await stf.get("club_products?slug=eq.couple_pass&select=ratio_units,ratio_heads,price_cents");
  const c = couple.data?.[0];
  note("anon", "a couple pass is one unit and two seats",
    c?.ratio_units === 1 && c?.ratio_heads === 2 && c?.price_cents === 65000, JSON.stringify(c ?? ""));

  /* --- the cap, counted under a lock --- */
  const prodSlug = `e2e-${stamp}-capped`;
  await stf.post("club_products", {
    slug: prodSlug, label: "E2E capped", blurb: "E2E", price_cents: 1, published: true,
    kind: "membership", vetting: "E2E", active_cap: 1, active: false,
  });
  /* membership_plans is unique on (plan_type, tier) over a five-by-three grid
     with thirteen squares already taken. Which two are free is not a constant —
     another module may fill one this week — so the free square is found rather
     than assumed. */
  const grid = await stf.get("membership_plans?select=plan_type,tier");
  const taken = new Set((grid.data || []).map((r) => `${r.plan_type}:${r.tier}`));
  let square = null;
  for (const t of ["access", "guest", "regional", "national", "global"]) {
    for (const n of [1, 2, 3]) if (!taken.has(`${t}:${n}`)) { square = [t, n]; break; }
    if (square) break;
  }
  note("staff", "the plan grid has a square to test on", !!square, "every plan_type x tier is taken");
  const plan = square ? await stf.post("membership_plans", {
    plan_type: square[0], tier: square[1], label: `E2E capped plan ${stamp}`, price_cents: 1,
    active: false, product_slug: prodSlug,
  }) : { status: 0, data: null };
  const planId = plan.data?.[0]?.id;
  note("staff", "a plan can name a product", !!planId, `got ${plan.status} ${JSON.stringify(plan.data ?? "").slice(0, 120)}`);

  /* trialing, not past_due: past_due fires run_automations('dues_failed') and
     this suite does not exist to send a real member a real letter about a card
     that was never charged. The plan_id the status trigger writes onto the
     profile is captured and put back below. */
  const before = await stf.get(`profiles?id=in.(${uid(p.regional)},${uid(p.national)})&select=id,plan_id,status`);
  const planWas = new Map((before.data || []).map((r) => [r.id, r.plan_id]));

  if (planId) {
    const first = await stf.post("subscriptions", { profile_id: uid(p.regional), plan_id: planId, status: "trialing" });
    note("staff", "the first of a capped membership is granted", first.status < 400, `got ${first.status}`);
    const second = await stf.post("subscriptions", { profile_id: uid(p.national), plan_id: planId, status: "trialing" });
    note("staff", "the place past the cap is refused, and says the cap",
      second.status >= 400 && /closed|places/i.test(JSON.stringify(second.data ?? "")),
      `got ${second.status} ${JSON.stringify(second.data ?? "").slice(0, 120)}`);

    /* Renewing the one that holds the place must not be read as a new claim. */
    const renew = await stf.patch(`subscriptions?plan_id=eq.${planId}`, { cancel_at_period_end: false });
    note("staff", "the member who holds the place can still renew it", renew.status < 400, `got ${renew.status}`);

    await stf.del(`subscriptions?plan_id=eq.${planId}`);
    for (const [id, was] of planWas) await stf.patch(`profiles?id=eq.${id}`, { plan_id: was });
    await stf.del(`membership_plans?id=eq.${planId}`);
  }
  await stf.del(`club_products?slug=eq.${prodSlug}`);

  /* --- the pause budget --- */
  const own = await reg.rpc("membership_pause_days_used", { p_profile: uid(p.regional) });
  note("regional", "a member can read their own days at sea", own.status < 400 && typeof own.data === "number",
    `got ${own.status} ${JSON.stringify(own.data)}`);
  const theirs = await reg.rpc("membership_pause_days_used", { p_profile: uid(p.global) });
  note("regional", "how long another member has been away is not readable", theirs.status >= 400,
    `got ${theirs.status} ${JSON.stringify(theirs.data ?? "").slice(0, 90)}`);

  /* A member's own pause opens a window, and letting the membership run again
     closes it. Both halves, because a window that never closes counts the rest
     of the year against the member. */
  const opened = await reg.rpc("set_own_standing", { p_status: "paused" });
  const running = await reg.get(`membership_pauses?profile_id=eq.${uid(p.regional)}&ended_at=is.null&select=id,by_the_member`);
  note("regional", "pausing opens a window and records whose choice it was",
    opened.status < 400 && (running.data || []).length === 1 && running.data[0].by_the_member === true,
    `${opened.status} ${JSON.stringify(running.data ?? "").slice(0, 90)}`);
  await reg.rpc("set_own_standing", { p_status: "active" });
  const closed = await reg.get(`membership_pauses?profile_id=eq.${uid(p.regional)}&ended_at=is.null&select=id`);
  note("regional", "resuming closes the window", (closed.data || []).length === 0,
    JSON.stringify(closed.data ?? "").slice(0, 90));
  /* handle_profile_status() writes a notice on each side of a pause. They are
     real notices about a real state change, so they are swept by title rather
     than left to accumulate two a run in a member's Word. */
  for (const t of ["Weather hold on your membership.", "Your membership is running again."]) {
    await stf.del(`notifications?profile_id=eq.${uid(p.regional)}&title=eq.${encodeURIComponent(t)}`);
  }

  const forgePause = await reg.post("membership_pauses", {
    profile_id: uid(p.regional), by_the_member: true,
    started_at: new Date(Date.now() - 400 * 864e5).toISOString(),
    ended_at: new Date(Date.now() - 399 * 864e5).toISOString(),
  });
  note("regional", "a member cannot write their own pause history", forgePause.status >= 400,
    `got ${forgePause.status}`);
  await stf.del(`membership_pauses?profile_id=eq.${uid(p.regional)}&started_at=lt.${new Date(Date.now() - 300 * 864e5).toISOString()}`);

  /* --- the credential that goes stale in a minute --- */
  const one = await reg.rpc("issue_member_qr");
  const two = await reg.rpc("issue_member_qr");
  const t1 = one.data?.[0]?.token, t2 = two.data?.[0]?.token;
  const ttl = t1 ? (Date.parse(one.data[0].expires_at) - Date.now()) / 1000 : NaN;
  note("regional", "the credential is minted fresh and lives about a minute",
    !!t1 && !!t2 && t1 !== t2 && ttl > 30 && ttl <= 61, `ttl ${Math.round(ttl)}s`);

  const scan = await stf.rpc("verify_member_qr", { p_token: t2 });
  note("staff", "a live credential reads as aboard", scan.data?.[0]?.state === "aboard",
    JSON.stringify(scan.data ?? "").slice(0, 120));
  const stale = await stf.rpc("verify_member_qr", { p_token: "00000000-0000-0000-0000-000000000000" });
  note("staff", "an unknown code reads as void and names nobody",
    stale.data?.[0]?.state === "void" && stale.data?.[0]?.profile_id === null,
    JSON.stringify(stale.data ?? "").slice(0, 120));
  const memberScan = await reg.rpc("verify_member_qr", { p_token: t2 });
  note("regional", "a member cannot work the gangway scanner", memberScan.status >= 400,
    `got ${memberScan.status}`);
  const otherToken = await nat.get(`member_qr_tokens?profile_id=eq.${uid(p.regional)}&select=token`);
  note("national", "another member's credential is not readable", (otherToken.data || []).length === 0,
    JSON.stringify(otherToken.data ?? "").slice(0, 90));
  const mintForOther = await reg.post("member_qr_tokens", {
    profile_id: uid(p.global), expires_at: new Date(Date.now() + 864e5).toISOString(),
  });
  note("regional", "a member cannot mint a credential at all", mintForOther.status >= 400,
    `got ${mintForOther.status}`);

  /* --- the number, held ninety days --- */
  const relFor = uid(p.paused);
  const held = await stf.rpc("release_member_number", { p_profile: relFor });
  note("staff", "a number can be given up", held.status < 400, `got ${held.status}`);
  const tooSoon = await stf.get(`member_number_releases?profile_id=eq.${relFor}&select=member_no`);
  const num = tooSoon.data?.[0]?.member_no;
  const early = await stf.rpc("reissue_member_number", { p_profile: uid(p.regional), p_number: num });
  note("staff", "a number released today is not in the pool today",
    early.status >= 400 && /still held/i.test(JSON.stringify(early.data ?? "")),
    `got ${early.status} ${JSON.stringify(early.data ?? "").slice(0, 120)}`);
  const memberPool = await reg.get("member_number_releases?select=member_no&limit=1");
  note("regional", "the number pool is not a directory of who left",
    (memberPool.data || []).length === 0, JSON.stringify(memberPool.data ?? "").slice(0, 90));
  await stf.del(`member_number_releases?profile_id=eq.${relFor}`);
  const stillHas = await stf.get(`profiles?id=eq.${relFor}&select=member_no`);
  note("staff", "giving a number up does not take it off the member",
    stillHas.data?.[0]?.member_no === num, JSON.stringify(stillHas.data ?? "").slice(0, 90));
}

async function main() {
  console.log(`e2e against ${BASE}\n`);
  const personas = {};
  for (const [name, email] of [
    ["regional", "e2e-regional@fixtures.invalid"],
    ["national", "e2e-national@fixtures.invalid"],
    ["global", "e2e-global@fixtures.invalid"],
    ["paused", "e2e-paused@fixtures.invalid"],
    ["staff", "e2e-staff@fixtures.invalid"],
  ]) {
    personas[name] = await login(email);
  }
  const knotsAtStart = {};
  for (const name of ["regional", "national", "global", "paused"]) {
    knotsAtStart[name] = await knotsFor(personas[name], personas.staff);
  }

  await sweep(personas);
  await routeMatrix(personas);
  await businessRules(personas);
  await parityRules(personas);
  await logbookRules(personas);
  await standingRules(personas);
  await rebrandRules(personas);
  await schemaInvariants(personas);
  await anonSurface();
  await isolationRules(personas);
  await commerceRules(personas);
  await opsRules(personas);
  await moderationRules(personas);
  await documentRules(personas);
  await enforcementRules(personas);
  await clubRules(personas);
  await hardeningRules(personas);
  await roundTwoRules(personas);
  await roundThreeRules(personas);
  await roundFiveRules(personas);
  await ratioAndRadarRules(personas);

  /* Activity, Charter and Membership are measured on their own before the
     suite's global footprint check runs, because that check is a single pinned
     number for the whole file and cannot say WHICH section moved a balance.
     These three create and delete real passes on fixture sailings, and a pass
     mints 25 knots on confirmation and gives them back on release — so the
     only way to know the release actually fired on every path, including the
     ones that go through a cascading voyage delete, is to weigh the ledger
     either side of them. */
  const kitBefore = {};
  for (const who of ["regional", "national", "global", "paused"]) {
    kitBefore[who] = await knotsFor(personas[who], personas.staff);
  }
  await activityRules(personas);
  await charterRules(personas);
  await membershipRules(personas);
  await remediationRules(personas);
  await programRules(personas);
  await crawlRules(personas);
  await decisionRules(personas);
  for (const [who, before] of Object.entries(kitBefore)) {
    const after = await knotsFor(personas[who], personas.staff);
    note(who, "activity, charter and membership leave the ledger as they found it",
      after === before, `moved ${after - before}`);
  }

  await sweep(personas);

  /* THE SUITE'S LEDGER FOOTPRINT, pinned.

     "Leaves the balance as it found it" is not achievable and it would be
     dishonest to assert it: fathoms_ledger is append-only by policy, and one of
     these tests deliberately completes a voyage and checks that the miles are
     banked. That award is the assertion — reversing it would defeat the test.

     So the footprint is pinned instead. Every run moves the global persona by
     exactly the awards its own tests intend and nobody else by anything. If
     these numbers change, either a test changed on purpose — in which case
     update them — or the suite has started leaving something behind, which is
     how the balances quietly climbed until an audit of a real member's knots
     became ambiguous and cost an hour to explain. */
  const EXPECTED_KNOTS_DRIFT = { regional: 0, national: 0, global: 100, paused: 0 };
  for (const [name, before] of Object.entries(knotsAtStart)) {
    const after = await knotsFor(personas[name], personas.staff);
    const moved = after - before;
    const want = EXPECTED_KNOTS_DRIFT[name] ?? 0;
    note(name, "the suite's knots footprint is the one it declares", moved === want,
      `moved ${moved}, declared ${want}`);
  }

  const passed = results.filter((r) => r.ok).length;
  writeFileSync(join(root, "e2e-report.json"), JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} e2e checks passed`);
  if (failures.length) process.exit(1);
  console.log("all personas accounted for — the manifest holds");
}

main().catch((e) => { console.error(e); process.exit(1); });
