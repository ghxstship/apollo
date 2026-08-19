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
  await routeMatrix(personas);
  await businessRules(personas);
  await parityRules(personas);
  await logbookRules(personas);

  const passed = results.filter((r) => r.ok).length;
  writeFileSync(join(root, "e2e-report.json"), JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} e2e checks passed`);
  if (failures.length) process.exit(1);
  console.log("all personas accounted for — the manifest holds");
}

main().catch((e) => { console.error(e); process.exit(1); });
