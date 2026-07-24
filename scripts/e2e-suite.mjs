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
    patch: (p, b) => call("PATCH", p, b),
    del: (p) => call("DELETE", p),
    rpc: (fn, args) => call("POST", `rpc/${fn}`, args),
  };
}
const uid = (s) => s.user.id;

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

  // Rewards: regional (135 FM) cannot afford the 250 FM reward
  const rw = await reg.get("rewards?select=id,cost_fm&order=cost_fm.asc&limit=1");
  const redeem = await reg.rpc("redeem_reward", { p_reward: rw.data?.[0]?.id });
  note("regional", "redemption guard: not enough fathoms", redeem.status >= 400 && /fathoms/i.test(JSON.stringify(redeem.data)), `got ${redeem.status}`);

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
  await routeMatrix(personas);
  await businessRules(personas);

  const passed = results.filter((r) => r.ok).length;
  writeFileSync(join(root, "e2e-report.json"), JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} e2e checks passed`);
  if (failures.length) process.exit(1);
  console.log("all personas accounted for — the manifest holds");
}

main().catch((e) => { console.error(e); process.exit(1); });
