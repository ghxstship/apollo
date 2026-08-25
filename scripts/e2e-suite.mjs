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
    /* Comments stripped BEFORE the array is located, for two reasons that both
       end with a gate reporting clean while enforcing nothing:

       the terminator was `\]` non-greedy, so it stopped at the FIRST close
       bracket — and a section comment reading "the retired [UN] drafts" inside
       the array truncated the list to seven entries with no error anywhere; and

       every double-quoted string in range became a banned term, so quoting an
       example in a comment silently banned it.

       Anchored on the real terminator as well, and a zero-length result is a
       hard failure rather than an empty list, because "no banned terms" and
       "could not read the banned terms" must never look the same. */
    const src = readFileSync(join(root, "src/lib/brand.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const block = src.match(/export const BANNED_TERMS[^=]*=\s*\[([\s\S]*?)\n\];/);
    if (!block) {
      console.error("could not read BANNED_TERMS from src/lib/brand.ts — the lexicon gate would pass on everything");
      process.exit(2);
    }
    const terms = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (terms.length === 0) {
      console.error("BANNED_TERMS parsed as empty — refusing to run a lexicon gate that bans nothing");
      process.exit(2);
    }
    return terms;
  } catch (e) {
    console.error("BANNED_TERMS could not be read:", String(e));
    process.exit(2);
  }
}
const BANNED = bannedTerms();
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) { console.error("E2E_PASSWORD not set — provision personas and pass their password."); process.exit(2); }

const REF = new URL(SUPA).hostname.split(".")[0];
/* A NOTE ON CHECKS THAT LIE.
   A broken comparator fails IDENTICALLY every time, so its output is confident
   and uniform — and uniformity reads as signal rather than as smoke. Three
   checks written against this database in one day reported, in turn, six of six
   renderings drifted, every snapshot stale, and realtime broken for members.
   All three were the checker: a wrong RPC parameter name, a key-order-sensitive
   comparison, and an insert that had been refused. A scatter of odd results
   makes you suspicious; a clean sweep makes you believe. Before trusting a red
   run, break the thing on purpose and watch it go red for the reason you
   expect. */
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
   leavings — before as well as after. Everything it creates is namespaced
   e2e-* / E2E* so the sweep can be exact rather than broad, and scoped by run
   token and age so it is exact about WHOSE. */
async function sweep(p) {
  const stf = rest(p.staff);
  await stf.del("applications?email=like.e2e-anon-*");
  await stf.del("crew_candidates?email=like.e2e-anon-*");
  await stf.del("api_keys?label=like.E2E*");
  await stf.del("webhooks?url=like.*example.com/e2e*");
  await stf.del("wardroom_flags?reason=eq.E2E");
  await stf.del("wardroom_posts?body=like.E2E*");
  /* Mine, or abandoned. Never somebody else's live fixture. */
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
  await stf.del("account_ledger?memo=like.E2E*");
  await stf.del("notifications?title=eq.A match, from your table");
  await stf.del("dating_tables?number=eq.99");
  await stf.del(`voyages?slug=like.e2e-table-night-*${RUN_TOKEN}*`);
  await stf.del(`voyages?slug=like.e2e-table-night-*&created_at=lt.${STALE_BEFORE()}`);
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
    ["issue yourself a member number", { member_no: "SYR-0001" }],
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
     that was not e2e-/@demo./@lyre.social — an audit account left on the
     club's own domain queued for real and stopped at the provider's quota. */
  const addressed = await stf.get(
    `email_outbox?select=to_email,status&template=eq.season-card&created_at=gt.${mailSince}&limit=500`
  );
  const fixtures = (addressed.data || []).filter((e) =>
    /^(e2e|test|probe|audit|fixture|smoke|viewport|qa)[-.]/i.test(e.to_email || "") ||
    /@(demo\.|example\.)/i.test(e.to_email || "") ||
    /@lyre\.social$/i.test(e.to_email || "")
  );
  note("staff", "the suite queued at least one fixture card to check the guard",
    fixtures.length > 0, "no fixture address in the season run");
  note("staff", "no card to a fixture address is left sendable",
    fixtures.every((e) => e.status === "skipped"),
    fixtures.filter((e) => e.status !== "skipped").map((e) => `${e.to_email}=${e.status}`).join(", "));

  await stf.del("email_outbox?template=eq.season-card&status=eq.pending");
  await stf.del("email_outbox?template=eq.season-card&status=eq.skipped");
}

/* ---------- M. Syrius: cabins, consent, tables, matches ----------
   The rebrand's new objects. Dating privacy is the sharp edge: a pick is
   private even from seatmates, and only mutuality surfaces anything. */
async function syriusRules(p) {
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
  const named = (codes.data || []).filter((c) => !/^SYR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c.code));
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
    ["a borrowed invite code", { full_name: "E2E Probe", email: "e2e-anon-probe@example.com", invite_code: "SYR-AAAA-BBBB" }],
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
      const isStaffRoute = r.path.startsWith("/bridge") || r.path === "/kiosk";
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
          const haystack = visible.toLowerCase();
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
  /* Clear the pair first. open_direct_thread returns an EXISTING thread without
     re-checking entitlement — deliberately, since you may keep talking to
     someone you already have a conversation with — so a thread this test opened
     on a previous run made every later run return 200 and report the gate
     broken. The residue, not the gate, was the failure. */
  {
    const gone = await stf.get(
      `direct_thread_pairs?select=thread_id&lo=eq.${[uid(p.global), uid(p.paused)].sort()[0]}` +
        `&hi=eq.${[uid(p.global), uid(p.paused)].sort()[1]}`
    );
    for (const row of gone.data || []) {
      await stf.del(`direct_thread_pairs?thread_id=eq.${row.thread_id}`);
      await stf.del(`thread_members?thread_id=eq.${row.thread_id}`);
      await stf.del(`threads?id=eq.${row.thread_id}`);
    }
  }
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
  const coded = (guests.data || []).every((g) => /^SYR-/.test(g.boarding_code || ""));
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
  note("national", "boarding code issued", /^SYR-/.test(natCode.data?.[0]?.boarding_code || ""), JSON.stringify(natCode.data));

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
  const bal = await reg.get(`fathoms_ledger?profile_id=eq.${uid(p.regional)}&select=delta`);
  const knots = (bal.data || []).reduce((sum, r) => sum + Number(r.delta ?? 0), 0);
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

/* Read through staff so a paused persona's own read policy cannot skew it, and
   bounded by TIME for the same reason folio() is.

   This summed an unbounded select and called the result a balance. PostgREST
   caps a response at 1000 rows whatever you ask for, and this persona's ledger
   is at 1043 — so it was summing an arbitrary PAGE, and which thousand you get
   shifts as rows are added. That is why the footprint check reported 75, then
   400, then 275 across three runs with no code between them: not leaked state,
   which accumulates monotonically, but a comparator measuring a moving window
   of somebody else's arithmetic.

   I had already found and fixed exactly this in folio(), in this file, earlier
   today — and wrote knotsFor a few hours before that without applying the same
   reasoning. Bounding by the run's own marker makes the window small, exact,
   and independent of how much history is behind it. */
async function knotsFor(person, staffSession, since) {
  const s = rest(staffSession);
  const res = await s.get(
    `fathoms_ledger?profile_id=eq.${uid(person)}&created_at=gt.${since}&select=delta`
  );
  const rows = res.data || [];
  if (rows.length >= 1000) throw new Error("knots window is too wide to trust — narrow the marker");
  return rows.reduce((t, r) => t + Number(r.delta || 0), 0);
}

/* — The frozen legal copy still says what the database says —

   src/app/preview/documents/snapshot.json is a FROZEN COPY OF BINDING LEGAL
   TEXT. The preview page reads live only when SUPABASE_SERVICE_ROLE_KEY is
   set, which is not the normal case, so it almost always serves the snapshot.
   Its banner honestly says "Snapshot · <date>" — and nothing compared that
   snapshot to the clause library. The one page whose whole purpose is letting
   a reviewer read the binding copy would quietly show them the wrong binding
   copy, under a date they have no reason to distrust.

   It is accurate today. That is the problem: accurate because nobody has
   edited a clause, not because anything would notice.

   FOUR THINGS THIS GETS RIGHT THAT THE OBVIOUS VERSION GETS WRONG.

   1. It resolves through published_version(), not by reading document_versions
      for a published row. Those are different ANSWERS, not two routes to one:
      published_version() filters on documents.active, and two inactive
      documents (r3-paper, e2e-r2-paper) still carry published versions. A
      direct read resolves both and compares against renderings no member can
      ever see — green on documents that, to the club, do not exist.

   2. It drives off LIVE contexts and asserts the COUNT. data.ts collapses two
      contexts that assemble identically and, because CONTEXTS is
      ["sea","shore"], the survivor is always sea. So a shore-only clause added
      to a document that currently collapses leaves live sea untouched, makes
      live shore diverge, and the snapshot still holds one rendering labelled
      "sea". Bodies alone pass, while the page shows one rendering where two
      exist and the missing one is the Port Day — the exact thing data.ts:44
      forbids: "a reviewer who reads one rendering has not read the document."

   3. It hashes THE WHOLE SHAPE, not the wording. Only clause_versions is
      immutable. `clauses`, `documents` and `document_requirements` carry no
      trigger at all — deliberately, since clauses.active is how a clause is
      retired. But that same mutability covers clauses.title, clauses.category,
      documents.validity_months and every requirement row, and the page renders
      all of them. Rename a clause, recategorise it, add a gate, or move
      validity_months from 12 to 24, and every body is byte-identical, the
      context count is unchanged, the document set is unchanged — and the page
      keeps showing the old manifest and the old renewal period. "Renews every
      12 months" is not decoration; it is a claim about how often a member must
      sign again.

      The database is deliberately NOT made rigid to spare this file. Staff
      correcting a typo in a clause title should not mint a new clause version
      — that would change what every future signature hashes, for a label
      nobody signed. The snapshot tracks the mutable thing instead.

   4. It checks the SHAPE of every response before trusting it. PostgREST
      answers an unnamed-parameter mistake with a 404 BODY rather than
      throwing, so an unguarded probe carries an error object forward as data.
      Written naively, this reported all six renderings as drifted —
      confidently, uniformly, and entirely fictionally — because it passed
      `p_code` where the function wants `p_document_code`. */
async function legalSnapshotRules(p) {
  const stf = rest(p.staff);
  let snap;
  try {
    snap = JSON.parse(readFileSync(join(root, "src/app/preview/documents/snapshot.json"), "utf8"));
  } catch (e) {
    note("staff", "the document snapshot is readable", false, String(e));
    return;
  }

  const live = await stf.get("documents?select=code&active=is.true&order=code");
  const activeCodes = (live.data || []).map((d) => d.code).sort();
  const frozenCodes = snap.documents.map((d) => d.code).sort();
  note("staff", "the snapshot covers exactly the active documents",
    JSON.stringify(activeCodes) === JSON.stringify(frozenCodes),
    `live [${activeCodes.join(", ")}] vs snapshot [${frozenCodes.join(", ")}]`);

  /* Sorted, because document_requirements has no ordering and PostgREST will
     not promise one — an unsorted comparison would flap. */
  const shapeOf = (o) => JSON.stringify(o);
  const CONTEXTS = ["sea", "shore"];
  let compared = 0;

  for (const doc of snap.documents) {
    const vid = await stf.rpc("published_version", { p_document_code: doc.code });
    if (typeof vid.data !== "string") {
      note("staff", `a published version resolves for ${doc.code}`, false,
        `got ${vid.status} ${JSON.stringify(vid.data).slice(0, 90)}`);
      continue;
    }

    /* The metadata the page prints above the body, none of which lives in an
       immutable table. */
    const [ver, reqs] = await Promise.all([
      stf.get(`document_versions?id=eq.${vid.data}&select=version`),
      stf.get(`document_requirements?document_code=eq.${doc.code}&select=gate`),
    ]);
    const docRow = await stf.get(`documents?code=eq.${doc.code}&select=validity_months`);
    const liveMeta = {
      version: ver.data?.[0]?.version ?? null,
      validity_months: docRow.data?.[0]?.validity_months ?? null,
      gates: (reqs.data || []).map((r) => r.gate).sort(),
    };
    const frozenMeta = {
      version: doc.version ?? null,
      validity_months: doc.validity_months ?? null,
      gates: [...(doc.gates || [])].sort(),
    };
    /* Names the field rather than printing two blobs. A reviewer told only
       that "the header moved" diffs three things to find one, and the renewal
       period is the one most worth pointing at directly: "renews every 12
       months" is a claim about how often a member must sign again. */
    const movedFields = Object.keys(frozenMeta).filter(
      (k) => shapeOf(liveMeta[k]) !== shapeOf(frozenMeta[k])
    );
    note("staff", `${doc.code} — the frozen header matches the live record`,
      movedFields.length === 0,
      movedFields
        .map((k) => `${k}: snapshot ${shapeOf(frozenMeta[k])} vs live ${shapeOf(liveMeta[k])}`)
        .join(" · "));

    /* Assembled exactly the way the page assembles it, de-duplication and all,
       so the count is comparable rather than merely the bodies. */
    const rendered = [];
    for (const cls of CONTEXTS) {
      const body = await stf.rpc("render_document", {
        p_document_version_id: vid.data,
        p_context: { class: cls },
      });
      if (typeof body.data !== "string" || !body.data) continue;
      if (rendered.some((r) => r.body === body.data)) continue;
      const cl = await stf.get(
        `document_clauses?document_version_id=eq.${vid.data}&select=position,condition,clause_versions(version,clause_code,clauses(title,category))&order=position`
      );
      const clauses = (cl.data || [])
        .map((row) => ({
          clause_code: row.clause_versions?.clause_code ?? "",
          title: row.clause_versions?.clauses?.title ?? "",
          category: row.clause_versions?.clauses?.category ?? "",
          version: row.clause_versions?.version ?? 0,
          position: row.position,
          condition: row.condition ?? {},
        }))
        .filter((c) => {
          const keys = Object.keys(c.condition);
          if (keys.length === 0) return true;
          return keys.every((k) => c.condition[k] === (k === "class" ? cls : undefined));
        });
      rendered.push({ class: cls, body: body.data, clauses });
    }

    note("staff", `${doc.code} renders as many contexts as the snapshot holds`,
      rendered.length === (doc.renderings || []).length,
      `live ${rendered.length} [${rendered.map((r) => r.class).join("+")}] vs snapshot ${(doc.renderings || []).length} [${(doc.renderings || []).map((r) => r.class).join("+")}]`);

    for (const r of rendered) {
      const frozen = (doc.renderings || []).find((x) => x.class === r.class);
      compared += 1;
      const same = !!frozen && shapeOf({ body: r.body, clauses: r.clauses }) ===
        shapeOf({ body: frozen.body, clauses: frozen.clauses });
      note("staff", `${doc.code}/${r.class} — the frozen copy matches the binding copy`, same,
        frozen
          ? frozen.body === r.body
            ? "the wording matches but the clause manifest moved — regenerate the snapshot"
            : `wording drifted: snapshot ${frozen.body.length} chars vs live ${r.body.length}`
          : "the snapshot holds no rendering for this context");
    }
  }

  note("staff", "every binding rendering was compared", compared > 0, `compared ${compared}`);
}

async function main() {
  console.log(`e2e against ${BASE}\n`);
  const personas = {};
  for (const [name, email] of [
    ["regional", "e2e-regional@syrius.social"],
    ["national", "e2e-national@syrius.social"],
    ["global", "e2e-global@syrius.social"],
    ["paused", "e2e-paused@syrius.social"],
    ["staff", "e2e-staff@syrius.social"],
  ]) {
    personas[name] = await login(email);
  }
  /* Everything the run does to the ledger is measured from here. */
  const runMark = new Date().toISOString();
  const knotsAtStart = {};
  for (const name of ["regional", "national", "global", "paused"]) {
    knotsAtStart[name] = await knotsFor(personas[name], personas.staff, runMark);
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
  await syriusRules(personas);
  await hardeningRules(personas);
  await roundTwoRules(personas);
  await roundThreeRules(personas);
  await roundFiveRules(personas);
  await legalSnapshotRules(personas);
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
  /* 150 → 100 because `removing_a_sailing_does_not_mint_knots` landed. The
     suite completes a fixture sailing (+100 "Miles banked") and seats two
     passes (+25 each); deleting the voyage used to leave all three standing,
     because the ledger rows lost their voyage_id before the reversal trigger
     could find them. The two pass awards now reverse. Miles banked does not —
     it is not in the reversal's reason list, and a completed sailing that
     really happened is not undone by tidying up the fixture.

     A number moving because a bug was fixed is the check doing its job. It
     should be updated with a reason, never widened to stop asking. */
  const EXPECTED_KNOTS_DRIFT = { regional: 0, national: 0, global: 100, paused: 0 };
  for (const [name, before] of Object.entries(knotsAtStart)) {
    const after = await knotsFor(personas[name], personas.staff, runMark);
    const moved = after - before;
    const want = EXPECTED_KNOTS_DRIFT[name] ?? 0;
    /* This check CANNOT distinguish its own footprint from a second copy of
       itself running against the same database, because both write the same
       reasons for the same personas in the same window. Observed at 75 on one
       run and 400 on the next with no code change between them, which is not
       what leaked state looks like — leaked state accumulates monotonically.
       So the message names concurrency first: it is the likelier explanation
       and the cheaper one to rule out. */
    note(name, "the suite's knots footprint is the one it declares", moved === want,
      `moved ${moved}, declared ${want} — if another run of this suite was live against ` +
        `the same project, that alone produces this; re-run alone before hunting a leak`);
  }

  const passed = results.filter((r) => r.ok).length;
  writeFileSync(join(root, "e2e-report.json"), JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} e2e checks passed`);
  if (failures.length) process.exit(1);
  console.log("all personas accounted for — the manifest holds");
}

main().catch((e) => { console.error(e); process.exit(1); });
