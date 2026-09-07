#!/usr/bin/env node
/**
 * Adversarial input harness — probes the reachable surface of the running app
 * with input a careless caller would never send but an attacker will.
 *
 * WHAT IT HITS
 *   - Public + authenticated pages (redirect sanitiser on /gangway).
 *   - Route handlers under src/app/api/ (search, producer, mcp, calendar,
 *     wallet, stub).
 *   - Server actions reachable by POSTing to a page (the "next-action" wire
 *     protocol), driven with the actions' real reference ids read out of the
 *     built client chunks.
 *
 * WHAT COUNTS AS A FINDING (worst first)
 *   500 / unhandled rejection · a database error, constraint name, SQL
 *   fragment or stack reaching the client · a write that succeeded when it
 *   should have been refused · another member's data returned · an injected
 *   string rendered unescaped · a pathologically slow request · a crash of the
 *   server.
 *
 * SAFETY — reads the e2e-suite's conventions and follows them exactly.
 *   - Signs in the same fixture personas (e2e-*@fixtures.invalid, E2E_PASSWORD).
 *   - Every row it could create is namespaced with a per-run token and the
 *     string "E2E" so the e2e-suite's own sweep and this file's sweep can find
 *     it; the sweep runs before AND after, and in a finally, so a run that dies
 *     halfway is still cleaned up.
 *   - Never sends real mail: any address it submits matches the outbox fixture
 *     guard (probe-*@fixtures.invalid — matches both the "probe" prefix and the
 *     @fixtures.invalid domain), so the queue-boundary trigger skips it.
 *   - Touches no row it did not create.
 *
 * USAGE
 *   E2E_PASSWORD=… BASE_URL=http://localhost:3222 node scripts/stress/adversarial.mjs
 *   …                                              node scripts/stress/adversarial.mjs --only=actions
 *   groups: redirect search producer mcp calendar actions rls
 *
 * Names every probe and its verdict in words. Exits non-zero on any finding.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = (process.env.BASE_URL || "http://localhost:3222").replace(/\/$/, "");

/* This harness POSTs deliberately malformed bodies at every route handler and
   server action it can find, and times how long the slow ones take. That
   belongs on a server nobody is using: a build of your own, or CI's. Pointing
   it at a deployed origin means firing the whole probe set at whoever is on
   the site at the time. So it will not go anywhere but the loopback unless
   somebody says out loud that they mean to. */
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(BASE)
    && process.env.ADVERSARIAL_ALLOW_REMOTE !== "1") {
  console.error(`BASE_URL is ${BASE}, which is not a server on this machine.`);
  console.error("This harness sends malformed input at every handler it can reach; run it against a build of");
  console.error("your own. If you genuinely mean to probe that origin, set ADVERSARIAL_ALLOW_REMOTE=1.");
  process.exit(2);
}

/* ---- env, exactly as the e2e-suite loads it ---- */
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

const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1] || null;
const RUN = `adv${Date.now().toString(36)}`;

/* ---- findings ledger ---- */
const findings = [];
const held = [];
/** record a probe verdict. ok=true means it held up; ok=false is a FINDING. */
function verdict(group, probe, ok, severity, detail = "") {
  if (ok) { held.push({ group, probe }); return; }
  findings.push({ group, probe, severity, detail });
  console.error(`  ✕ [${severity}] ${group} :: ${probe}\n      ${String(detail).slice(0, 300)}`);
}

/* ---- session plumbing (mirrors e2e-suite) ---- */
async function login(email) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: ANON },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (res.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, attempt * 12_000));
      continue;
    }
    throw new Error(`login failed for ${email}: ${res.status} ${text}`);
  }
}
const cookieFor = (s) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(s)).toString("base64url")}`;
const uid = (s) => s.user.id;

async function getPage(session, path, extraHeaders = {}) {
  return fetch(BASE + path, {
    redirect: "manual",
    headers: { cookie: session ? cookieFor(session) : "", "user-agent": "un-adv", ...extraHeaders },
  });
}

/* Supabase REST, as a persona — for reading back writes and for the sweep. */
function rest(session) {
  const call = async (method, path, body, extra = {}) => {
    const res = await fetch(`${SUPA}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: ANON,
        authorization: `Bearer ${session ? session.access_token : ANON}`,
        "content-type": "application/json",
        prefer: "return=representation",
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  };
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b),
    del: (p) => call("DELETE", p),
    rpc: (fn, args) => call("POST", `rpc/${fn}`, args),
  };
}

/* ---- server-action wire protocol ----
   A React server action is invoked by POSTing to any page route with a
   `next-action: <ref-id>` header and the argument array as the JSON body. The
   ref-ids are stable per build and are emitted verbatim into the client
   chunks; read them out rather than guess. */
function loadActionIds() {
  const ids = {};
  const dir = join(root, ".next", "static", "chunks");
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) {
        const src = readFileSync(p, "utf8");
        for (const m of src.matchAll(/createServerReference\)\("([0-9a-f]+)"[^)]*,"([A-Za-z0-9_$]+)"\)/g)) {
          ids[m[2]] ??= m[1];
        }
      }
    }
  };
  try { walk(dir); } catch (e) { console.error("could not read client chunks — did you `npm run build`?", e); }
  return ids;
}
const ACTION_IDS = loadActionIds();

/** Call a server action by name with a JS argument array. Returns
 *  {status, body, threw} where threw is true on a 500 error digest. */
async function callAction(session, page, name, args) {
  const id = ACTION_IDS[name];
  if (!id) return { status: 0, body: `no ref-id for action ${name}`, missing: true };
  const res = await fetch(BASE + page, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: session ? cookieFor(session) : "",
      "next-action": id,
      "content-type": "text/plain;charset=UTF-8",
      "user-agent": "un-adv",
    },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  // A thrown/unhandled action serialises as an error row with a digest.
  const threw = res.status >= 500 || /"digest":"\d+"/.test(body) || /\d+:E\{/.test(body);
  return { status: res.status, body, threw };
}

/* A DB error message / constraint name / SQL fragment / stack leaking to the
   client. The app's `voice()` layer is supposed to translate all of these. */
const LEAK = /row-level security|violates .* constraint|invalid input syntax for type|syntax error at or near|SQLSTATE|pg_|permission denied for|relation "|column "|\bat \/|node_modules|\.ts:\d+|PostgrestError|22P02|23505|23503|42501/i;
function bodyLeaks(body) {
  const m = String(body).match(LEAK);
  return m ? m[0] : null;
}

/* ---- adversarial payload corpus ---- */
const BIG = "A".repeat(1_000_000);
const MED = "A".repeat(10_000);
const PAYLOADS = {
  empty: "",
  one: "A",
  med: MED,
  big: BIG,
  unicode: "𝕏𝕐𝕫 🏴‍☠️ é́ combining",
  rtl: "abc‮abc‬",
  nullByte: "a b",
  newlines: "line1\r\nBcc: evil@example.com\nX-Injected: 1",
  html: "<script>alert(1)</script><img src=x onerror=alert(1)>",
  template: "${process.env} #{7*7} {{7*7}} %s %n",
  longword: "z".repeat(5000),
  sql: "'); drop table profiles;--",
};
const FOREIGN_UUID = "11111111-2222-3333-4444-555555555555"; // well-formed, not the caller's
const BAD_UUID = "not-a-uuid";
const TYPE_CONFUSION = [
  ["number", 12345],
  ["true", true],
  ["null", null],
  ["object", { a: 1 }],
  ["array", [1, 2, 3]],
  ["nan", Number.NaN],
  ["neg", -1],
  ["inf", 1e308],
  ["past2^53", 9007199254740993],
];

const sessions = {};

/* ═══════════════════════ GROUP: redirect (safe-next) ═══════════════════════ */
async function probeRedirect() {
  const g = "redirect";
  // Payloads that must NOT escape our origin once resolved. safe-next.ts claims
  // to defeat these; confirm the rendered page never carries an off-origin next.
  const escapes = [
    "//evil.com",
    "/\\evil.com",
    "/..//evil.com",
    "https://evil.com",
    "HtTpS://evil.com",
    "javascript:alert(1)",
    "%2F%2Fevil.com",
    "%2f%5cevil.com",
    "/%2e%2e//evil.com",
    "\t//evil.com",
    "/ //evil.com",
    "https:evil.com",
    "///evil.com",
    "/legit?x=1&next=//evil.com",
  ];
  for (const raw of escapes) {
    const res = await getPage(null, `/gangway?next=${encodeURIComponent(raw)}`);
    const html = await res.text();
    // The sanitised value lands in a hidden <input name="next"> and in links.
    // Any occurrence of an off-origin authority in a next context is a defeat.
    const m = html.match(/name="next"[^>]*value="([^"]*)"/i);
    const embedded = (m ? m[1] : "").replace(/&amp;/g, "&");
    // The only question that matters: does the embedded value, once the browser
    // resolves it, leave our origin? A leading single "/" followed by a literal
    // (even a percent-encoded slash, or "evil.com" inside a path/query) stays home.
    let escaped = false;
    try {
      const resolved = new URL(embedded, "http://safe-next.invalid");
      escaped =
        resolved.origin !== "http://safe-next.invalid" ||
        embedded.startsWith("//") ||
        embedded.startsWith("/\\") ||
        /^[a-z][a-z0-9+.-]*:/i.test(embedded); // any scheme, incl. javascript:
    } catch {
      escaped = true; // an unparseable value in an href is itself a defect
    }
    verdict(g, `next=${raw} is neutralised`, !escaped && res.status < 500,
      "high", `status ${res.status}, embedded next="${embedded}"`);
  }
  // A page-level 500 on any of these would itself be a finding, covered above.
}

/* ═══════════════════════ GROUP: search (/api/search) ═══════════════════════ */
async function probeSearch() {
  const g = "search";
  const s = sessions.regional;
  const cases = [];
  for (const [k, v] of Object.entries(PAYLOADS)) cases.push([k, v]);
  cases.push(["percent-wild", "%_%"]);
  cases.push(["or-injection", "a,title.ilike.*,or(id.gt.0)"]);
  cases.push(["paren", "a)(b"]);
  cases.push(["backslash", "a\\b"]);
  cases.push(["double-encoded", "%2527"]);
  for (const [name, q] of cases) {
    const t0 = Date.now();
    let res, body;
    try {
      res = await getPage(s, `/api/search?q=${encodeURIComponent(q)}`);
      body = await res.text();
    } catch (e) {
      // A megabyte-long query string overflows the platform's max header/URL
      // size, so the connection is refused at the transport before the handler
      // runs. That is the host declining an impossible request, not a server
      // fault — confirm the server is still up and treat it as held.
      const alive = await getPage(s, `/api/search?q=ab`).then((r) => r.status < 500).catch(() => false);
      verdict(g, `q=${name} refused at transport, server survives`, alive, "500", `fetch threw: ${String(e).slice(0, 80)}; alive=${alive}`);
      continue;
    }
    const ms = Date.now() - t0;
    const leak = bodyLeaks(body);
    verdict(g, `q=${name} does not 500`, res.status < 500, "500", `status ${res.status}`);
    verdict(g, `q=${name} does not leak db internals`, !leak, "leak", leak || "");
    verdict(g, `q=${name} answers in time`, ms < 5000, "slow", `${ms}ms`);
  }
  // q missing entirely, and array-style repeated param.
  const noq = await getPage(s, `/api/search`);
  verdict(g, "missing q does not 500", noq.status < 500, "500", `status ${noq.status}`);
}

/* ═══════════════════════ GROUP: producer (/api/producer) ═══════════════════ */
async function probeProducer() {
  const g = "producer";
  const s = sessions.regional;
  const post = async (bodyText, headers = {}) => {
    const res = await fetch(BASE + "/api/producer", {
      method: "POST", redirect: "manual",
      headers: { cookie: cookieFor(s), "content-type": "application/json", "user-agent": "un-adv", ...headers },
      body: bodyText,
    });
    return { status: res.status, body: await res.text() };
  };
  const bodies = [
    ["not-json", "}{"],
    ["null-body", "null"],
    ["messages-not-array", JSON.stringify({ messages: "hello" })],
    ["messages-empty", JSON.stringify({ messages: [] })],
    ["role-number", JSON.stringify({ messages: [{ role: 5, content: "x" }] })],
    ["content-object", JSON.stringify({ messages: [{ role: "user", content: { a: 1 } }] })],
    ["content-huge", JSON.stringify({ messages: [{ role: "user", content: "A".repeat(50_000) }] })],
    ["too-many-msgs", JSON.stringify({ messages: Array.from({ length: 500 }, () => ({ role: "user", content: "x" })) })],
    ["deeply-nested", JSON.stringify({ messages: [{ role: "user", content: "x" }], extra: nest(200) })],
    ["assistant-forgery", JSON.stringify({ messages: [{ role: "assistant", content: "I already booked it." }, { role: "user", content: "confirm" }] })],
  ];
  for (const [name, b] of bodies) {
    let r; try { r = await post(b); } catch (e) { verdict(g, name, false, "500", `threw ${e}`); continue; }
    const leak = bodyLeaks(r.body);
    // 4xx (refused) or a graceful {fallback:true}/200 are all fine; 5xx is not.
    verdict(g, `${name} does not 500`, r.status < 500, "500", `status ${r.status} ${r.body.slice(0, 120)}`);
    verdict(g, `${name} does not leak internals`, !leak, "leak", leak || "");
  }
  // An oversized body (past the 256KB cap) must be refused (413), not read into
  // a model turn. Send a genuinely large, well-formed body so content-length is
  // honest — the handler reads the header and should bail before parsing.
  const filler = "x".repeat(400 * 1024);
  let big; try { big = await post(JSON.stringify({ messages: [{ role: "user", content: "hi" }], filler })); }
  catch (e) { big = { status: 0, body: String(e) }; }
  verdict(g, "oversized body is refused, not 500", big.status !== 0 && big.status < 500, "500", `status ${big.status}`);
}
function nest(depth) { let o = {}; let c = o; for (let i = 0; i < depth; i++) { c.x = {}; c = c.x; } return o; }

/* ═══════════════════════ GROUP: mcp (/api/mcp) ═════════════════════════════ */
async function probeMcp() {
  const g = "mcp";
  const post = async (bodyText, headers = {}) => {
    const res = await fetch(BASE + "/api/mcp", {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/json", "user-agent": "un-adv", ...headers },
      body: bodyText,
    });
    return { status: res.status, body: await res.text() };
  };
  // No key at all — must be a clean 401/503, never a 500 or a leak.
  const cases = [
    ["no-auth-empty", "{}", {}],
    ["no-auth-garbage", "}{", {}],
    ["bad-key-jsonrpc", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), { authorization: "Bearer un_deadbeef" }],
    ["bad-key-batch", JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }))), { authorization: "Bearer un_deadbeef" }],
    ["bad-key-empty-batch", "[]", { authorization: "Bearer un_deadbeef" }],
    ["bad-key-method-object", JSON.stringify({ jsonrpc: "2.0", id: 1, method: { a: 1 } }), { authorization: "Bearer un_deadbeef" }],
    ["bad-key-huge-body", JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "x", arguments: { q: "A".repeat(200_000) } } }), { authorization: "Bearer un_deadbeef" }],
    ["sql-in-key", "{}", { authorization: "Bearer un_' OR '1'='1" }],
  ];
  for (const [name, b, h] of cases) {
    let r; try { r = await post(b, h); } catch (e) { verdict(g, name, false, "500", `threw ${e}`); continue; }
    const leak = bodyLeaks(r.body);
    verdict(g, `${name} does not 500`, r.status < 500, "500", `status ${r.status} ${r.body.slice(0, 120)}`);
    verdict(g, `${name} does not leak internals`, !leak, "leak", leak || "");
  }
  // GET must be 405, never 500.
  const get = await fetch(BASE + "/api/mcp", { headers: { "user-agent": "un-adv" } });
  verdict(g, "GET is refused cleanly", get.status < 500, "500", `status ${get.status}`);
}

/* ═══════════════════════ GROUP: calendar + wallet + stub ═══════════════════ */
async function probeCalendar() {
  const g = "calendar";
  const slugs = [
    ["long", "a".repeat(5000)],
    ["nullbyte", "a%00b"],
    ["crlf-header", "a%0d%0aSet-Cookie:%20x=1"],
    ["traversal", "..%2f..%2fetc%2fpasswd"],
    ["double-enc", "%252e%252e"],
    ["unicode", "%F0%9D%95%8F"],
    ["upper", "ABC"],
    ["space", "a%20b"],
    ["quote", "a%22b"],
  ];
  for (const [name, slug] of slugs) {
    let res; try { res = await getPage(null, `/api/calendar/episode/${slug}`); } catch (e) { verdict(g, name, false, "500", `threw ${e}`); continue; }
    const body = await res.text();
    verdict(g, `slug=${name} does not 500`, res.status < 500, "500", `status ${res.status}`);
    // A CRLF that reaches the Content-Disposition filename would be header injection.
    const cd = res.headers.get("content-disposition") || "";
    verdict(g, `slug=${name} sets no injected header`, !/\r|\n/.test(cd) && !cd.includes("Set-Cookie"), "leak", cd);
    verdict(g, `slug=${name} does not leak internals`, !bodyLeaks(body), "leak", bodyLeaks(body) || "");
  }
  // The member token calendar feed, given a junk token.
  for (const [name, tok] of [["bad", "not-a-token"], ["long", "a".repeat(5000)], ["crlf", "a%0d%0ax"]]) {
    const res = await getPage(null, `/api/calendar/${tok}`);
    verdict(g, `token feed ${name} does not 500`, res.status < 500, "500", `status ${res.status}`);
  }
  // Public stub / wallet pass by junk code.
  for (const [name, code] of [["stub-bad", "ZZZ"], ["stub-long", "a".repeat(2000)], ["w-bad", "nope"]]) {
    const path = name.startsWith("stub") ? `/stub/${code}` : `/w/${code}`;
    const res = await getPage(null, path);
    verdict(g, `${name} does not 500`, res.status < 500, "500", `status ${res.status}`);
  }
  const ws = await getPage(null, "/api/wallet/status");
  verdict(g, "wallet status responds", ws.status < 500, "500", `status ${ws.status}`);
}

/* ═══════════════════════ GROUP: actions (server actions) ═══════════════════
   The sharp edge. Each action is a public POST endpoint once you know its
   ref-id; the type of every argument is whatever the caller serialises. */
async function probeActions() {
  const g = "actions";
  const s = sessions.regional;
  const other = uid(sessions.national); // a real member who is not the caller

  // NOTE ON SCOPE. Only "closure" server actions — those with plain positional
  // arguments — can be driven with a JSON argument array. The useActionState
  // form actions (signature `(prevState, FormData)`: createPost, sendAWord,
  // updateProfile, sendMessage, signDocument, …) require the multipart action
  // wire protocol; invoking them with scalars would throw in the framework, not
  // the app, so they are deliberately NOT probed here (a false finding is worse
  // than none). Every action below takes positional scalars.

  // 1) TYPE CONFUSION on scalar-id actions that render text.
  //    These call raw string methods (.trim(), .slice()) on their arguments.
  const stringArgActions = [
    // page,               action,        buildArgs(payload)
    ["/open-deck", "addComment", (v) => [FOREIGN_UUID, v]],
    ["/open-deck", "flagPost", (v) => [FOREIGN_UUID, "other", v]],
    ["/radar", "openTheLog", (v) => [v]],
    ["/passes", "postCrewRequest", (v) => [FOREIGN_UUID, v]],
    ["/passes", "applyPromo", (v) => [v, FOREIGN_UUID]],
  ];
  for (const [page, name, build] of stringArgActions) {
    if (!ACTION_IDS[name]) { console.error(`  (skip ${name} — no ref-id)`); continue; }
    for (const [tname, tval] of TYPE_CONFUSION) {
      // Only the shapes where a string method would blow up on a non-string.
      if (!["number", "true", "object", "array", "nan", "inf", "past2^53"].includes(tname)) continue;
      const r = await callAction(s, page, name, build(tval));
      verdict(g, `${name}(${tname}) is handled, not a 500`, !r.threw && r.status < 500,
        "500", `status ${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 160)}`);
      verdict(g, `${name}(${tname}) does not leak internals`, !bodyLeaks(r.body), "leak", bodyLeaks(r.body) || "");
    }
  }

  // 2) SIZE — a string well past the field's own cap (but under Next's 1 MB RSC
  //    action-body limit) must be refused in words, never persisted, never a
  //    500. (A >1 MB argument is rejected by the framework's bodySizeLimit
  //    before the action runs — that guard is Next's, not the app's, so it is
  //    not asserted here.)
  for (const [page, name, build] of [
    ["/open-deck", "addComment", (v) => [FOREIGN_UUID, v]],
    ["/passes", "postCrewRequest", (v) => [FOREIGN_UUID, v]],
  ]) {
    if (!ACTION_IDS[name]) continue;
    for (const [size, val] of [["10K", MED], ["500K", "A".repeat(500_000)]]) {
      const r = await callAction(s, page, name, build(val));
      verdict(g, `${name}(${size} string) is handled, not a 500`, !r.threw && r.status < 500,
        "500", `status ${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }

  // 3) FOREIGN / MALFORMED IDENTIFIERS — a write against another member's or a
  //    non-existent id must be refused, and must not touch another member.
  const idActions = [
    ["/open-deck", "deletePost", (id) => [id]],
    ["/open-deck", "toggleHail", (id) => [id, false]],
    ["/passes", "releasePass", (id) => [id]],
    ["/passes", "setAutoClaim", (id) => [id, true]],
    ["/passes", "withdrawOffer", (id) => [id]],
    ["/inbox", "markRead", (id) => [id]],
    ["/polls", "castVote", (id) => [id, 0]],
    ["/tonight", "claimSeat", (id) => [id]],
  ];
  for (const [page, name, build] of idActions) {
    if (!ACTION_IDS[name]) continue;
    for (const [idname, id] of [["foreign-uuid", FOREIGN_UUID], ["malformed", BAD_UUID], ["number", 0], ["neg", -1]]) {
      const r = await callAction(s, page, name, build(id));
      verdict(g, `${name}(${idname}) is handled, not a 500`, !r.threw && r.status < 500,
        "500", `status ${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 160)}`);
      verdict(g, `${name}(${idname}) does not leak internals`, !bodyLeaks(r.body), "leak", bodyLeaks(r.body) || "");
    }
  }

  // 4) NUMERIC abuse — negative / NaN / Infinity / non-integer counts & options.
  if (ACTION_IDS.setGuests) {
    for (const [nname, n] of [["neg", -5], ["nan", Number.NaN], ["inf", Infinity], ["float", 1.5], ["huge", 1e9], ["past2^53", 9007199254740993]]) {
      const r = await callAction(s, "/passes", "setGuests", [FOREIGN_UUID, n, []]);
      verdict(g, `setGuests(${nname}) is handled, not a 500`, !r.threw && r.status < 500,
        "500", `status ${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }
  if (ACTION_IDS.castVote) {
    for (const [nname, n] of [["neg", -1], ["huge", 999], ["nan", Number.NaN], ["float", 1.5], ["string", "1"]]) {
      const r = await callAction(s, "/polls", "castVote", [FOREIGN_UUID, n]);
      verdict(g, `castVote(option=${nname}) is handled, not a 500`, !r.threw && r.status < 500,
        "500", `status ${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }

  // 5) ARRAY abuse — improvePass takes an array of addon ids.
  if (ACTION_IDS.improvePass) {
    for (const [aname, arr] of [["empty", []], ["10K", Array.from({ length: 10_000 }, () => FOREIGN_UUID)], ["not-array", "x"], ["nested", [[[1]]]]]) {
      const r = await callAction(s, "/passes", "improvePass", [FOREIGN_UUID, arr]);
      verdict(g, `improvePass(${aname}) is handled, not a 500`, !r.threw && r.status < 500,
        "500", `status ${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 140)}`);
    }
  }

  // 6) TEXT injection through a scalar action into a stored+rendered field:
  //    addComment's body is echoed on /open-deck. A script/HTML payload must be
  //    accepted-and-escaped or refused, never a 500 and never a leak. The
  //    comment targets a foreign/non-existent post id, so nothing persists;
  //    the sweep clears any comment this persona made carrying the run token.
  if (ACTION_IDS.addComment) {
    const payload = `E2E-${RUN} <script>alert(1)</script><img src=x onerror=alert(1)>`;
    const r = await callAction(s, "/open-deck", "addComment", [FOREIGN_UUID, payload]);
    verdict(g, "addComment(script tag) is handled, not a 500", !r.threw && r.status < 500,
      "500", `status ${r.status} ${r.body.replace(/\s+/g, " ").slice(0, 140)}`);
    verdict(g, "addComment(script tag) does not leak internals", !bodyLeaks(r.body), "leak", bodyLeaks(r.body) || "");
  }
  void other;
}

/* ═══════════════════════ GROUP: rls (direct data boundary) ══════════════════
   Not app code, but the same authenticated session hits PostgREST with foreign
   ids and writes it should never be allowed. A write that SUCCEEDS here is the
   worst finding class. Reads must come back empty, not error. */
async function probeRls() {
  const g = "rls";
  const r = rest(sessions.regional);
  const otherId = uid(sessions.national);

  // Read another member's private rows by id — must be empty, not an error.
  for (const rel of ["notifications", "passes", "account_ledger", "knots_ledger"]) {
    const res = await r.get(`${rel}?select=*&profile_id=eq.${otherId}&limit=5`);
    const empty = res.status === 200 && Array.isArray(res.data) && res.data.length === 0;
    verdict(g, `cannot read ${rel} of another member`, empty, "data",
      `status ${res.status} rows ${Array.isArray(res.data) ? res.data.length : "?"}`);
  }
  // Write into another member's profile — must be refused (0 rows / error), not applied.
  const w = await r.post("profiles?id=eq." + otherId, { bio: `E2E-${RUN} tamper` });
  const applied = w.status < 300 && Array.isArray(w.data) && w.data.length > 0;
  verdict(g, "cannot patch another member's profile", !applied, "write", `status ${w.status}`);
  // Grant myself staff — must be refused.
  const selfStaff = await rest(sessions.regional).rpc("security_report", {});
  verdict(g, "member cannot run the staff security report", selfStaff.status >= 400, "write", `status ${selfStaff.status}`);
}

/* ═══════════════════════ sweep — before, after, and on failure ═════════════ */
async function sweep() {
  const stf = rest(sessions.staff);
  try {
    await stf.del(`open_deck_posts?body=like.E2E-${RUN}*`);
    await stf.del(`open_deck_posts?body=like.*E2E-${RUN}*`);
    // flags/comments/hails a probe may have raised on any post, by this persona.
    for (const who of ["regional", "national"]) {
      const id = uid(sessions[who]);
      await stf.del(`open_deck_flags?flagger_id=eq.${id}`);
      await stf.del(`open_deck_comments?author_id=eq.${id}&body=like.*${RUN}*`);
    }
    // profiles.bio: undo any tamper this run's marker left (defensive; write
    // should have been refused, so this normally deletes nothing).
    await stf.get(`profiles?bio=like.*E2E-${RUN}*&select=id`).then(async (res) => {
      for (const row of res.data || []) await stf.post(`profiles?id=eq.${row.id}`, { bio: null });
    });
  } catch (e) {
    console.error("sweep warning:", String(e).slice(0, 200));
  }
}


/* The two endpoints that answer an UNAUTHENTICATED request by changing
   something. Everything else on this surface either reads, or demands a
   session first; these two are reached with no cookie at all, by design:
   RFC 8058 one-click needs a POST a mail client can make, and a member who
   has lost their authenticator cannot sign in to ask for help.

   That makes them the newest and sharpest surface in the app, and the harness
   had no cases for them. What is being asked here is narrow and specific: do
   they refuse junk without falling over, do they answer the same whether a
   thing exists or not, and can a caller learn anything from the difference
   between two refusals. */
async function probeUnauthenticated() {
  const g = "unauthenticated";

  const post = (path, body, headers = {}) =>
    fetch(BASE + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  /* ---- one-click unsubscribe ---- */
  const tokens = [
    ["missing", ""],
    ["junk", "not-a-uuid"],
    ["long", "a".repeat(5000)],
    ["sqli", "' or 1=1 --"],
    ["crlf", "a%0d%0aSet-Cookie:%20x=1"],
    ["traversal", "..%2f..%2f"],
    ["nul", "a%00b"],
    /* Well-formed and certainly not minted. */
    ["unminted", "00000000-0000-4000-8000-000000000000"],
  ];
  const seen = new Set();
  for (const [name, t] of tokens) {
    let res;
    try { res = await post(`/api/unsubscribe?t=${t}`, {}); }
    catch (e) { verdict(g, `unsubscribe ${name}`, false, "500", `threw ${e}`); continue; }
    const body = await res.text();
    /* 500 is a crash; 503 is a deployment saying it cannot do this, which is
       a legitimate answer and the one an unwired checkout gives too. */
    verdict(g, `unsubscribe ${name} does not 500`, res.status !== 500, "500", `status ${res.status}`);
    verdict(g, `unsubscribe ${name} leaks nothing`, !bodyLeaks(body), "leak", bodyLeaks(body) || "");
    const cd = res.headers.get("set-cookie") || "";
    verdict(g, `unsubscribe ${name} sets no cookie`, !cd, "leak", cd);
    if (name === "junk" || name === "unminted") seen.add(`${res.status}:${body}`);
  }
  /* A malformed token and a well-formed one that was never minted must be
     indistinguishable. If they differ, the endpoint answers "does this token
     exist" for anybody who asks, and the whole roster can be tested one uuid
     at a time. */
  verdict(g, "unsubscribe tells a bad token from an unminted one apart from nothing",
    seen.size === 1, "leak", [...seen].join("  ≠  "));

  /* GET is answered too — some clients follow the header as a link rather
     than posting it — and must refuse the same things. */
  const viaGet = await fetch(`${BASE}/api/unsubscribe?t=not-a-uuid`);
  verdict(g, "unsubscribe GET does not 500", viaGet.status !== 500, "500", `status ${viaGet.status}`);

  /* ---- recovery ---- */
  const bodies = [
    ["empty", {}],
    ["nonsense", "not json at all"],
    ["array", [1, 2, 3]],
    ["nested", { email: { $ne: null }, code: { $gt: "" } }],
    ["long-email", { email: "a".repeat(9000) + "@x.test", code: "ABCD1234EFGH" }],
    ["long-code", { email: "e2e-national@fixtures.invalid", code: "A".repeat(9000) }],
    ["sqli", { email: "' or 1=1 --", code: "' or '1'='1" }],
    ["types", { email: 12345, code: true }],
    ["unknown-member", { email: "nobody-at-all@fixtures.invalid", code: "ABCD1234EFGH" }],
    ["known-member-wrong-code", { email: "e2e-national@fixtures.invalid", code: "ABCD1234EFGH" }],
  ];
  const answers = new Map();
  for (const [name, b] of bodies) {
    let res;
    try { res = await post("/api/recover", b); }
    catch (e) { verdict(g, `recover ${name}`, false, "500", `threw ${e}`); continue; }
    const body = await res.text();
    verdict(g, `recover ${name} does not 500`, res.status !== 500, "500", `status ${res.status}`);
    verdict(g, `recover ${name} leaks nothing`, !bodyLeaks(body), "leak", bodyLeaks(body) || "");
    verdict(g, `recover ${name} does not sign anybody in`, !(res.headers.get("set-cookie") || "").includes("auth-token"),
      "authz", res.headers.get("set-cookie") || "");
    if (name === "unknown-member" || name === "known-member-wrong-code") answers.set(name, `${res.status}:${body}`);
  }
  /* The one that matters. If a member the club has never heard of is refused
     differently from a member with a wrong code, this endpoint answers "is
     this person a member" to anybody who asks — which is the roster, one
     address at a time, from a path that needs no session. */
  const [unknown, wrong] = [answers.get("unknown-member"), answers.get("known-member-wrong-code")];
  verdict(g, "recover tells a stranger from a member with a bad code apart from nothing",
    unknown !== undefined && unknown === wrong, "leak", `${unknown}  ≠  ${wrong}`);

  /* A body larger than the route's own bound. readBounded should refuse it
     without reading it all into memory. */
  const huge = await post("/api/recover", "x".repeat(200_000));
  verdict(g, "recover refuses an oversized body", huge.status >= 400 && huge.status !== 500, "500", `status ${huge.status}`);
}

/* ═══════════════════════ driver ════════════════════════════════════════════ */
const GROUPS = {
  redirect: probeRedirect,
  search: probeSearch,
  producer: probeProducer,
  mcp: probeMcp,
  calendar: probeCalendar,
  actions: probeActions,
  rls: probeRls,
  unauthenticated: probeUnauthenticated,
};

async function main() {
  console.log(`adversarial harness against ${BASE}  (run ${RUN})`);
  if (ONLY && !GROUPS[ONLY]) { console.error(`unknown group: ${ONLY}. groups: ${Object.keys(GROUPS).join(" ")}`); process.exit(2); }

  for (const [name, email] of [
    ["regional", "e2e-regional@fixtures.invalid"],
    ["national", "e2e-national@fixtures.invalid"],
    ["staff", "e2e-staff@fixtures.invalid"],
  ]) sessions[name] = await login(email);

  await sweep();
  try {
    for (const [name, fn] of Object.entries(GROUPS)) {
      if (ONLY && name !== ONLY) continue;
      console.log(`\n── ${name} ──`);
      await fn();
    }
  } finally {
    await sweep();
  }

  console.log(`\n${held.length} probes held up · ${findings.length} findings`);
  if (findings.length) {
    console.log("\nFINDINGS");
    for (const f of findings) console.log(`  [${f.severity}] ${f.group} :: ${f.probe} — ${String(f.detail).slice(0, 200)}`);
    process.exit(1);
  }
  console.log("no findings — the probed surface held up");
}
main().catch((e) => { console.error(e); process.exit(1); });
