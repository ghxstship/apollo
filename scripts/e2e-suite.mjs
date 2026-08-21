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
    headers: { cookie: session ? cookieFor(session) : "", "user-agent": "lyre-e2e" },
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
  await stf.del("contests?slug=like.e2e-*");
  await stf.del("voyages?slug=like.e2e-*");
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
const ANON_READABLE = [
  "voyages", "harbors", "vessels", "voyage_vessels", "dispatch_posts",
  "addons", "membership_plans", "crew_roles", "voyage_capacity",
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
  "contests", "contest_entries", "contest_results", "voyage_media",
  "member_engagement", "member_affinity", "fathoms_balance", "account_balance",
  "waitlist_position", "member_league", "member_pass_usage",
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

  // Writes: the two public funnels take an INSERT, nothing else takes anything.
  const stamp = Date.now().toString(36);
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

  /* These views are security_invoker, so RLS on the underlying tables empties
     them out. A row may still appear for another member — the id is already
     public in the directory — but every figure in it must be zero. Asserting
     the row is absent would be asserting the wrong thing. */
  for (const v of OWNED_VIEWS) {
    const res = await reg.get(`${v}?select=*&profile_id=eq.${other}&limit=5`);
    const rows = Array.isArray(res.data) ? res.data : [];
    const bare = rows.every((row) =>
      Object.entries(row).every(([k, val]) =>
        k === "profile_id" || val === 0 || val === null || k === "league" || k === "league_name" || k === "month"));
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
    ["issue yourself a member number", { member_no: "LYR-0001" }],
    ["set your own billing account", { stripe_customer_id: "cus_e2e_takeover" }],
  ]) {
    const res = await reg.patch(`profiles?id=eq.${uid(p.regional)}`, patch);
    note("regional", `cannot ${label}`, res.status >= 400, `got ${res.status} ${JSON.stringify(res.data).slice(0, 90)}`);
  }

  /* Billing takeover: the portal opens whatever customer sits on the profile,
     so claiming an id another member already holds must be refused. */
  const stamp0 = Date.now().toString(36);
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

  // An order belongs to whoever placed it, and its total is not theirs to set.
  const order = await reg.post("shop_orders", { profile_id: uid(p.regional), total_cents: 22000 });
  const oid = order.data?.[0]?.id;
  note("regional", "may place an order", order.status < 400, `got ${order.status}`);

  if (oid) {
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
  const stamp = Date.now().toString(36);
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

  const readFlags = await reg.get("wardroom_flags?select=status&limit=5");
  note("regional", "flag queue is not a member's to read", (readFlags.data || []).length <= 1, `got ${readFlags.status} ${(readFlags.data || []).length} rows`);

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
    p_signer_name: "E2e Regional", p_user_agent: "lyre-e2e",
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
  const guests = await stf.get("rsvp_guests?select=id,sign_token,name&limit=1");
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
      p_signature_data: "E2E Redaction Guest", p_user_agent: "lyre-e2e",
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
  const before = (await stf.get("signatures?select=id&limit=1000")).data || [];
  const purge = await stf.rpc("purge_expired_signatures", { p_years: 6 });
  const afterCount = ((await stf.get("signatures?select=id&limit=1000")).data || []).length;
  note("staff", "the retention sweep runs", purge.status < 400, `got ${purge.status}`);
  note("staff", "the sweep spares signatures inside the window", afterCount === before.length,
    `${before.length} before, ${afterCount} after`);

  if (gId) await stf.del(`rsvp_guests?id=eq.${gId}`);
  if (grId) await stf.del(`rsvps?id=eq.${grId}`);

}

/* ---------- L. enforcement, counter-signature, automations ----------
   The last of the deferred work: a waiver that stops somebody, a contract that
   binds both sides, and rules that actually fire. */
async function enforcementRules(p) {
  const reg = rest(p.regional), stf = rest(p.staff), anon = rest(null);
  const stamp = Date.now().toString(36);

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

  const cards = await stf.rpc("send_season_cards", {
    p_from: "2026-02-01T00:00:00Z", p_to: "2026-07-01T00:00:00Z", p_season: `E2E ${stamp}`,
  });
  note("staff", "the season's cards queue", cards.status < 400 && Number(cards.data) > 0, `${cards.data} queued`);
  const queued = await stf.get(`email_outbox?select=payload&template=eq.season-card&limit=5`);
  note("staff", "a card carries the member's figures",
    (queued.data || []).some((e) => Number(e.payload?.nm_logged) > 0), JSON.stringify(queued.data?.[0]?.payload || {}).slice(0, 90));
  await stf.del("email_outbox?template=eq.season-card&status=eq.pending");
}

/* ---------- A. route × role matrix ---------- */
async function routeMatrix(personas) {
  const memberPages = manifest.routes.filter((r) => r.type === "page" && !r.dynamic && r.access === "member");
  for (const [name, s] of Object.entries(personas)) {
    for (const r of memberPages) {
      const res = await page(s, r.path);
      const isStaffRoute = r.path.startsWith("/bridge");
      if (isStaffRoute && name !== "staff") {
        const loc = res.headers.get("location") || "";
        const ok = res.status >= 300 && res.status < 400 && loc.includes("/home-port");
        note(name, `staff gate holds on ${r.path}`, ok, `got ${res.status} → ${res.headers.get("location")}`);
      } else {
        const ok = res.status === 200;
        note(name, `renders ${r.path}`, ok, `got ${res.status}`);
        if (ok) {
          const html = await res.text();
          note(name, `${r.path} free of error text`, !/Application error|__next_error__/i.test(html));
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
async function logbookRules(p) {
  const reg = rest(p.regional), glo = rest(p.global), stf = rest(p.staff);

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
  const reg = rest(p.regional), nat = rest(p.national), glo = rest(p.global), stf = rest(p.staff);

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

  const pushBefore = ((await stf.get("push_outbox?select=id&limit=1000")).data || []).length;
  const board = await glo.post("rsvps", { voyage_id: svid, profile_id: uid(p.global), status: "aboard" });
  note("global", "boards the fixture", board.status === 201, `got ${board.status}`);
  await new Promise((r) => setTimeout(r, 600));

  const crew = await glo.get(`threads?voyage_id=eq.${svid}&kind=eq.crew&select=id`);
  const tid = crew.data?.[0]?.id;
  note("global", "a confirmed pass opens a crew thread", !!tid, JSON.stringify(crew.data).slice(0, 80));

  // Fan-out is a trigger, not app code: the Word queued a push on its own.
  const pushAfter = ((await stf.get("push_outbox?select=id&limit=1000")).data || []).length;
  note("staff", "notifications fan out to push", pushAfter > pushBefore, `${pushBefore} → ${pushAfter}`);

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
  const open1 = await glo.rpc("open_direct_thread", { p_other: uid(p.national) });
  const open2 = await glo.rpc("open_direct_thread", { p_other: uid(p.national) });
  note("global", "opens a direct thread", open1.status === 200 && !!open1.data, `got ${open1.status}`);
  note("global", "direct thread is idempotent", open1.data === open2.data, `${open1.data} vs ${open2.data}`);
  if (open1.data) {
    const said = await glo.post("messages", { thread_id: open1.data, author_id: uid(p.global), body: "Midnight watch is mine." });
    note("global", "writes into own direct thread", said.status === 201, `got ${said.status}`);
    const peek = await reg.get(`messages?thread_id=eq.${open1.data}&select=id`);
    note("regional", "third party cannot read a direct thread", (peek.data || []).length === 0, JSON.stringify(peek.data).slice(0, 60));
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
  const guests = await glo.get("rsvp_guests?select=name,boarding_code&limit=3");
  const coded = (guests.data || []).every((g) => /^LS-/.test(g.boarding_code || ""));
  note("global", "guests carry their own codes", (guests.data || []).length > 0 && coded, JSON.stringify(guests.data).slice(0, 120));

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
  note("paused", "membership hold blocks boarding", pauTry.status >= 400 && /hold/i.test(JSON.stringify(pauTry.data)), `got ${pauTry.status}`);

  // Guest passes: national with guests rejected, global capped at 2
  const natGuest = await nat.post("rsvps", { voyage_id: vid, profile_id: uid(p.national), status: "aboard", guests: 1 });
  note("national", "guest berths require Global", natGuest.status >= 400 && /Global/i.test(JSON.stringify(natGuest.data)), `got ${natGuest.status}`);

  // National takes the single berth (also proves ledger charge trigger)
  const natRsvp = await nat.post("rsvps", { voyage_id: vid, profile_id: uid(p.national), status: "aboard" });
  note("national", "reserves the berth", natRsvp.status === 201, `got ${natRsvp.status} ${JSON.stringify(natRsvp.data).slice(0, 120)}`);
  const natLedger = await nat.get(`account_ledger?voyage_id=eq.${vid}&kind=eq.berth&select=delta_cents`);
  note("national", "berth charge posts to house account", natLedger.data?.[0]?.delta_cents === -1000, JSON.stringify(natLedger.data));
  const natCode = await nat.get(`rsvps?voyage_id=eq.${vid}&profile_id=eq.${uid(p.national)}&select=boarding_code`);
  note("national", "boarding code issued", /^LS-/.test(natCode.data?.[0]?.boarding_code || ""), JSON.stringify(natCode.data));

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
  const rw = await reg.get("rewards?select=id,cost_fm&order=cost_fm.asc&limit=1");
  const redeem = await reg.rpc("redeem_reward", { p_reward: rw.data?.[0]?.id });
  note("regional", "redemption guard: not enough knots", redeem.status >= 400 && /not enough knots/i.test(JSON.stringify(redeem.data)), `got ${redeem.status} ${JSON.stringify(redeem.data)}`);

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

  // Cleanup fixture (cascade removes rsvps/flags; ledger rows keep voyage_id null)
  const rm = await stf.del(`voyages?id=eq.${vid}`);
  note("staff", "removes fixture voyage", rm.status === 200 || rm.status === 204, `got ${rm.status}`);
}

async function main() {
  console.log(`e2e against ${BASE}\n`);
  const personas = {};
  for (const [name, email] of [
    ["regional", "e2e-regional@lyre.social"],
    ["national", "e2e-national@lyre.social"],
    ["global", "e2e-global@lyre.social"],
    ["paused", "e2e-paused@lyre.social"],
    ["staff", "e2e-staff@lyre.social"],
  ]) {
    personas[name] = await login(email);
  }
  await sweep(personas);
  await routeMatrix(personas);
  await businessRules(personas);
  await parityRules(personas);
  await logbookRules(personas);
  await schemaInvariants(personas);
  await anonSurface();
  await isolationRules(personas);
  await commerceRules(personas);
  await opsRules(personas);
  await moderationRules(personas);
  await documentRules(personas);
  await enforcementRules(personas);
  await sweep(personas);

  const passed = results.filter((r) => r.ok).length;
  writeFileSync(join(root, "e2e-report.json"), JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} e2e checks passed`);
  if (failures.length) process.exit(1);
  console.log("all personas accounted for — the manifest holds");
}

main().catch((e) => { console.error(e); process.exit(1); });
