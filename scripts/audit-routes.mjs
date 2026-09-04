#!/usr/bin/env node
/**
 * Route audit — fetches every route in src/lib/route-manifest.json (expanding
 * dynamic routes from live Supabase slugs) and fails on errors, violations,
 * or failures:
 *
 *   errors      5xx responses, fetch failures, wrong status for the surface
 *   violations  missing <title>, missing <html lang>, <img> without alt,
 *               Next.js error boundary text, unexpected indexability
 *   failures    broken internal links, sitemap entries that don't resolve,
 *               protected routes that DON'T redirect signed-out visitors,
 *               unknown-slug pages that don't 404, missing PWA manifest/icons
 *
 * Usage:  BASE_URL=http://localhost:3000 node scripts/audit-routes.mjs
 *         node scripts/audit-routes.mjs --source   (source invariants only; no server)
 *         node scripts/audit-routes.mjs --manifest-only
 *           — no server, no network: only the check that the manifest covers
 *             every page and handler under src/app (and names no file that is
 *             gone). This is the form `npm run gates` runs.
 * Runs in CI on every push and on a daily schedule (.github/workflows/route-audit.yml).
 * Exits non-zero if anything fails; writes route-audit-report.json.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { letterInvariants } from "./lib/letters.mjs";
import { readBannedTerms } from "./lib/banned-terms.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "src", "lib", "route-manifest.json"), "utf8"));

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const MANIFEST_ONLY = process.argv.includes("--manifest-only");

/* Supabase creds for expanding dynamic slugs — from env or .env.local. */
function loadEnvLocal() {
  try {
    const text = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* CI provides env directly */ }
}
loadEnvLocal();
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/* Brand lexicon guard, read from the source of truth — shared with the
   letter audit through scripts/lib/banned-terms.mjs, so there is one
   extractor and one set of traps to remember. */
const BANNED = readBannedTerms(root);

/* ---------- source invariants ----------
   Two things the fetch pass structurally cannot see. A dev-only route 404s in
   a production build — correctly, that is the point of it — so there is no
   HTML to check, and a dev route is exactly where a reviewer reads longest.
   And no amount of served markup reveals whether a dialog handles a key. */
function sourceFiles(dir, out = [], deep = true) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (deep) sourceFiles(full, out); }
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/* Reads a source file with its comments removed. */
function stripped(file) {
  /* The first cut of these checks read the prose in a comment that said
     "no layout supplies a <main>" and failed the one file whose markup was
     already correct — a gate that fires on the explanation of a rule rather
     than on a breach of it is worse than no gate, because the fix it invites
     is to reword the comment. The `:` guard keeps "https://" out of the
     line-comment case. */
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

/* Every page must HAVE a landing, not merely label the one it has correctly.
   The check below asserts the id on each <main> it finds, which says nothing
   at all about a page that has none — and the served-HTML pass cannot speak
   for a dev-only route, because that route 404s in production by design. A
   page whose root is a bare <div> was invisible to both. */
function pagesHaveALanding() {
  for (const r of manifest.routes.filter((x) => x.type === "page")) {
    let dir = dirname(r.file);
    let from = null;
    while (dir.startsWith("src/app")) {
      const layout = join(root, dir, "layout.tsx");
      try {
        if (/<main\b/.test(stripped(layout))) { from = dir + "/layout.tsx"; break; }
      } catch { /* no layout at this level */ }
      if (dir === "src/app") break;
      dir = dirname(dir);
    }
    if (from) { note(r.path, "has somewhere for the skip link to land", true, `from ${from}`); continue; }
    /* No layout supplies one, so the route must bring its own — in the page
       itself or in a component beside it, which is how /kiosk does it. */
    const here = dirname(join(root, r.file));
    const own = sourceFiles(here, [], false).filter((f) => /<main\b/.test(stripped(f)));
    note(r.path, "has somewhere for the skip link to land", own.length > 0,
      `nothing in ${dirname(r.file)} renders a <main>`);
  }
}

/* The letter gate — registry, sender and callers held in agreement — lives
   in scripts/lib/letters.mjs and runs alone as scripts/audit-letters.mjs. It
   used to be two functions here, and the registry reader fell into two traps
   in one evening (a semicolon in prose, a comment quoting its own regex);
   the reader there knows where a string literal ends. */

/* The manifest must cover every page and handler under src/app, and name no
   file that is gone. generate-route-manifest.mjs is what writes it, but a
   hand edit, a stale checkout or a renamed folder can leave the two apart,
   and every check downstream of here trusts the manifest as the list of
   what exists. (Reconstructed after a concurrent-edit collision removed the
   original; if the original is restored, prefer it.) */
function manifestCoversTheFilesystem() {
  const app = join(root, "src", "app");
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/^(page|route)\.tsx?$/.test(name)) found.push(full.slice(root.length + 1));
    }
  };
  walk(app);
  const listed = new Set(manifest.routes.map((r) => r.file));
  for (const file of found.sort()) {
    note(file, "is in the route manifest", listed.has(file), "run npm run routes:manifest");
  }
  for (const r of manifest.routes) {
    note(r.path, "manifest names a file that exists", existsSync(join(root, r.file)), r.file);
  }
}

function sourceInvariants() {
  manifestCoversTheFilesystem();
  pagesHaveALanding();
  letterInvariants({ root, note, banned: BANNED });
  const files = sourceFiles(join(root, "src"));
  for (const file of files) {
    const rel = file.slice(root.length + 1);
    const src = stripped(file);

    /* The skip link lives in the root layout and so renders on every page, but
       its target is per-layout. /gangway, /sign/[token], all three kiosk
       screens and the dev document preview each shipped a <main> with no id —
       the first tab stop on the page you sign in on, the page you sign a
       waiver on, and the screen the crew boards people with went nowhere. A
       link that goes nowhere costs a keystroke and teaches the reader that the
       affordance is a lie. */
    for (const tag of src.match(/<main\b[\s\S]*?>/g) || []) {
      note(rel, "every <main> is the skip link's landing", /\bid="main"/.test(tag),
        tag.replace(/\s+/g, " ").slice(0, 60));
    }

    /* Four surfaces declared role="dialog" and none of them handled Escape,
       took focus, trapped Tab or gave focus back. They share one hook now;
       this is what stops a fifth from hand-rolling three of the four again. */
    if (/role="dialog"/.test(src)) {
      note(rel, "a role=dialog surface uses the shared modal hook", /useModal\s*\(/.test(src),
        'declares role="dialog" without useModal()');
    }
  }
}

const results = [];
const failures = [];
const note = (route, check, ok, detail = "") => {
  results.push({ route, check, ok, detail });
  if (!ok) failures.push({ route, check, detail });
};

async function get(path, redirect = "manual") {
  const res = await fetch(BASE + path, { redirect, headers: { "user-agent": "un-route-audit" } });
  return res;
}

async function fetchSlugs(source) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${source.table}?select=${source.column}`, {
    headers: { apikey: SUPA_KEY, authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) throw new Error(`slug fetch failed for ${source.table}: ${res.status}`);
  return (await res.json()).map((row) => row[source.column]);
}

function checkHtml(route, html) {
  note(route, "has <title>", /<title[^>]*>[^<]+<\/title>/i.test(html));
  note(route, "has <html lang>", /<html[^>]+lang=/i.test(html));
  note(route, "no error boundary", !/Application error|Internal Server Error|__next_error__/i.test(html), "error text found");
  const badImgs = [...html.matchAll(/<img\b[^>]*>/gi)].filter((m) => !/\balt=/i.test(m[0]));
  note(route, "images carry alt", badImgs.length === 0, badImgs.length ? `${badImgs.length} <img> without alt` : "");
  const lexHay = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<![^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
  /* A missing value must never reach a reader as the word for it. "UNTIL
     AUG 23 · undefined" shipped on /agreements because a date helper read a
     part its own formatter never produced, and every gate here was looking
     only for banned brand words. */
  const spilled = ["undefined", "null", "nan", "[object object]"].filter((w) => {
    /* Escaped: "[object object]" is a regex character class if you don't, and
       compiles into something that matches almost any letter. */
    const lit = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[\\s·—,:(])${lit}([\\s·—,.:)]|$)`, "i").test(lexHay);
  });
  note(route, "no spilled placeholder in visible text", spilled.length === 0,
    spilled.length ? `found: ${spilled.join(", ")}` : "");
  /* Belt to the source-level braces in sourceInvariants(): the served page is
     the only place a layout and its page can be seen together. */
  if (html.includes('class="ls-skip"')) {
    note(route, "the skip link has somewhere to land", /id="main"/.test(html),
      'ls-skip is present but no id="main"');
  }
  const offLexicon = BANNED.filter((term) => lexHay.includes(term.toLowerCase()));
  note(route, "on-lexicon", offLexicon.length === 0, offLexicon.length ? `banned terms: ${offLexicon.join(", ")}` : "");
  /* The producer never shouts: no exclamation marks and no emoji in visible
     text. Strip script/style/doctype/comments and tags first — attributes and
     code may legitimately carry both. */
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<![^>]*>/g, "")
    .replace(/<[^>]+>/g, " ");
  const shouts = (visible.match(/!/g) || []).length;
  note(route, "the producer never shouts", shouts === 0, shouts ? `${shouts} exclamation mark(s) in visible text` : "");
  const emoji = visible.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{268F}\u{2692}-\u{2712}\u{2714}-\u{27BF}\u{FE0F}]/u /* U+2690/1 ⚐⚑ are the kit's Hail glyphs, not emoji */);
  note(route, "no emoji", !emoji, emoji ? `found ${emoji[0]}` : "");
}

function internalLinks(html) {
  return [...html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("//") && !/\.(css|js|svg|png|jpg|ico|zip|webmanifest|xml|txt)$/.test(h));
}

/* PROVE THE PAGE IS THERE.

   The signed-out redirect check above cannot do it: middleware bounces every
   /bridge/* path to the gangway before routing, so a route that does not exist
   is indistinguishable from one that does. This signs in and asks the page to
   render.

   It needs a password, and the audit is otherwise credential-free, so when
   E2E_PASSWORD is absent this reports a SKIP rather than a pass. A check that
   silently turns into a green tick when its credentials are missing is worse
   than no check — that is precisely how six screens scored twelve ticks while
   the build contained none of them. */
async function renderCheck(pages) {
  const password = process.env.E2E_PASSWORD;
  if (!password) {
    console.log("\n  protected pages NOT proven to render — set E2E_PASSWORD to check\n");
    note("(all protected pages)", "proven to render", false, "E2E_PASSWORD not set");
    return;
  }
  const signIn = async (email) => {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return r.json();
  };
  const staff = await signIn("e2e-staff@fixtures.invalid");
  if (!staff.access_token) {
    note("(all protected pages)", "proven to render", false, "staff sign-in failed");
    return;
  }
  const ref = new URL(SUPA_URL).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(staff)).toString("base64")}`;

  /* The negative control. If an invented path renders too, this whole check is
     measuring something other than what it claims to. */
  const invented = await fetch(`${BASE}/bridge/utterly-invented-${Date.now().toString(36)}`, {
    headers: { cookie }, redirect: "manual",
  });
  note("(control)", "an invented protected path does NOT render", invented.status === 404, `got ${invented.status}`);

  /* THE KEYS CONSOLE WAITS FOR A PARTNER (decided 2026-09-02). /bridge/keys
     is in the manifest and in the build, but the page answers notFound() and
     the Bridge nav drops its tab while club_settings.keys_console_enabled is
     0 — nothing reads a key and nothing posts a hook, so a console that
     offers to cut one is a promise the hull cannot keep.

     The expectation is read from the same dial the page reads, live, so an
     operator who opens the console for a partner does not have to touch this
     file: at 0 the route must be off the chart (404, never 500, and still a
     titled page in the club's language); at 1 it must render like any other
     Bridge screen. A dial that cannot be read is reported as such rather than
     guessed either way. */
  const keysOpen = await keysConsoleOpen(staff.access_token);
  note("/bridge/keys", "the keys dial can be read", keysOpen !== null, "club_settings.keys_console_enabled unreadable");

  for (const { path } of pages) {
    const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
    if (path === "/bridge/keys" && keysOpen === false) {
      note(path, "waits for a partner — 404, not 500", res.status === 404, `got ${res.status}`);
      const html = await res.text();
      note(path, "has <title>", /<title[^>]*>[^<]+<\/title>/i.test(html));
      /* A notFound() thrown from a page renders in Next's error shell, which
         drops the root <html lang> — the same body /preview/documents answers
         with, and the audit asks nothing of that one. What matters here is
         that it is the club's 404, not the stock line of text. */
      note(path, "answers with the club's 404", /Off the chart/i.test(html));
      continue;
    }
    if (path === "/bridge/keys" && keysOpen === null) continue; /* reported above */
    note(path, "renders for someone allowed to see it", res.status === 200, `got ${res.status}`);
  }
}

/* club_settings is public reading; the staff token is used because that is
   the session the page itself reads the dial with. Returns true/false, or null
   when the row cannot be read — the caller must not turn null into a guess. */
async function keysConsoleOpen(token) {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/club_settings?key=eq.keys_console_enabled&select=value_int`, {
      headers: { apikey: SUPA_KEY, authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0].value_int !== "number") return null;
    return rows[0].value_int > 0;
  } catch {
    return null;
  }
}

function report() {
  const passed = results.filter((r) => r.ok).length;
  writeFileSync(join(root, "route-audit-report.json"), JSON.stringify({ base: MANIFEST_ONLY ? null : BASE, checkedAt: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  if (failures.length) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(`  ✕ ${f.route} — ${f.check}${f.detail ? ` (${f.detail})` : ""}`);
    process.exit(1);
  }
}

async function main() {
  if (MANIFEST_ONLY) {
    console.log("route manifest vs src/app\n");
    manifestCoversTheFilesystem();
    report();
    console.log("the manifest covers every page and handler under src/app");
    return;
  }
  console.log(`auditing ${BASE}\n`);
  sourceInvariants();
  /* Source-only: the invariants that need no server, for a checkout with
     none running. The full audit still runs in CI against a built site. */
  if (process.argv.includes("--source")) {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} source checks passed`);
    if (failures.length) {
      console.error("\nFAILURES:");
      for (const f of failures) console.error(`  ✕ ${f.route} — ${f.check}${f.detail ? ` (${f.detail})` : ""}`);
      process.exit(1);
    }
    return;
  }

  // Expand the manifest into concrete URLs.
  const pages = [];
  for (const r of manifest.routes) {
    if (r.type === "handler") continue; // handled separately
    if (!r.dynamic) { pages.push({ path: r.path, access: r.access }); continue; }
    if (r.access === "member") {
      // Auth-gated dynamic routes can't be expanded signed-out; verify the
      // prefix redirect with a probe slug instead.
      const probe = await get(r.path.replace(/\[[^\]]+\]/, "__audit-probe__"));
      const ok = probe.status >= 300 && probe.status < 400 && (probe.headers.get("location") || "").includes("/gangway");
      note(r.path, "redirects signed-out to /gangway", ok, `status ${probe.status}`);
      continue;
    }
    if (r.credential) {
      /* Addressed by a bearer secret. The audit confirms it refuses a made-up
         one rather than enumerating real ones. */
      const res = await fetch(`${BASE}${r.path.replace(/\[\w+\]/, "00000000-0000-0000-0000-000000000000")}`, { redirect: "manual" });
      note(r.path, "a made-up credential is refused", res.status === 404, `got ${res.status}`);
      continue;
    }
    if (!r.source) { note(r.path, "dynamic route has slug source", false, "add to DYNAMIC_SOURCES"); continue; }
    const slugs = await fetchSlugs(r.source);
    /* A source may declare that zero rows is a legitimate state. Exactly one
       thing needs this so far and it is the reason the flag exists rather than
       a fudge: /crew/[slug] lists crew who have OPTED IN to being shown, and
       until somebody does, the correct number of pages is none.

       Without the flag the audit forced a choice between two wrong answers —
       leave the route unregistered (which fails on line 450 instead), or invent
       a person to satisfy a counter. The flag is narrower than either: the
       route still has to 404 an unknown slug, and every row that does appear is
       still crawled and checked. */
    const mayBeEmpty = r.source.allowEmpty === true;
    note(
      r.path,
      mayBeEmpty ? "slug source resolves (may legitimately be empty)" : "slug source non-empty",
      mayBeEmpty || slugs.length > 0,
      `${slugs.length} slugs`
    );
    for (const s of slugs) pages.push({ path: r.path.replace(/\[[^\]]+\]/, s), access: r.access });
    // Unknown slugs must 404, never 500.
    const missing = await get(r.path.replace(/\[[^\]]+\]/, "__audit-missing__"));
    note(r.path, "unknown slug returns 404", missing.status === 404, `got ${missing.status}`);
  }

  await renderCheck(pages.filter((r) => r.access === "member" && !r.dynamic));


  const seenLinks = new Set();

  for (const { path, access } of pages) {
    let res;
    try {
      res = await get(path);
    } catch (e) {
      note(path, "fetch", false, String(e));
      continue;
    }

    if (access === "member") {
      /* Signed out, every member surface must bounce to the gangway — AND THAT
         ALONE PROVES NOTHING ABOUT THE PAGE. Middleware redirects before
         routing, so a path that has never existed bounces identically:
         /bridge/utterly-invented returns the same 307 as /bridge/members. On
         the sibling branch six new screens scored twelve green ticks here
         while the running build contained none of them. renderCheck() below
         signs in and requires the page to actually render. */
      const ok = res.status >= 300 && res.status < 400 && (res.headers.get("location") || "").includes("/gangway");
      note(path, "redirects signed-out to /gangway", ok, `status ${res.status} → ${res.headers.get("location")}`);
      /* AND THAT ALONE PROVES NOTHING ABOUT THE PAGE. Middleware redirects
         /bridge/* before routing, so a path that has NEVER EXISTED bounces to
         the gangway exactly like a real one — verified: /bridge/utterly-invented
         returns the same 307. Six new Bridge screens once scored twelve green
         ticks here while the running build contained none of them.

         So the redirect is checked, and then the page is fetched with a real
         session and required to render. See renderCheck() below. */
      continue;
    }

    if (access === "dev") {
      /* A dev-only route must NOT answer in a production build. The audit used
         to demand 200 from every non-member route, which would have insisted a
         route whose whole point is to be unreachable in production be
         reachable — and would have passed a build that shipped it. */
      note(path, "is not reachable in a production build", res.status === 404, `got ${res.status}`);
      continue;
    }

    note(path, "status 200", res.status === 200, `got ${res.status}`);
    if (res.status !== 200) continue;
    const html = await res.text();
    checkHtml(path, html);
    for (const link of internalLinks(html)) seenLinks.add(link);
  }

  // Handlers: GET /auth/confirm without a token must fail safe into the gangway.
  const confirm = await get("/auth/confirm");
  note("/auth/confirm", "tokenless hit fails safe", confirm.status >= 300 && confirm.status < 400 && (confirm.headers.get("location") || "").includes("/gangway"), `status ${confirm.status}`);
  const signout = await get("/auth/signout");
  note("/auth/signout", "GET rejected (POST-only)", signout.status === 405, `got ${signout.status}`);

  // Link integrity: every internal href found on public pages must resolve.
  const knownPaths = new Set(pages.map((p) => p.path));
  for (const link of [...seenLinks].sort()) {
    if (knownPaths.has(link)) { note(link, "link resolves", true, "in manifest"); continue; }
    const res = await get(link);
    const ok = res.status === 200 || (res.status >= 300 && res.status < 400);
    note(link, "link resolves", ok, `got ${res.status}`);
  }

  // Sitemap: parses, and every URL it advertises resolves.
  const sm = await get("/sitemap.xml");
  note("/sitemap.xml", "status 200", sm.status === 200, `got ${sm.status}`);
  if (sm.status === 200) {
    const xml = await sm.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    note("/sitemap.xml", "advertises URLs", urls.length > 0, `${urls.length} entries`);
    for (const u of urls) {
      if (knownPaths.has(u === "" ? "/" : u)) continue;
      const res = await get(u || "/");
      note(u || "/", "sitemap URL resolves", res.status === 200, `got ${res.status}`);
    }
    const memberLeaks = urls.filter((u) => manifest.protectedPrefixes.some((p) => u === p || u.startsWith(p + "/")));
    note("/sitemap.xml", "no member routes leaked", memberLeaks.length === 0, memberLeaks.join(", "));
  }

  // Robots + PWA surface.
  const robots = await get("/robots.txt");
  note("/robots.txt", "status 200", robots.status === 200, `got ${robots.status}`);
  const pwa = await get("/manifest.webmanifest");
  note("/manifest.webmanifest", "status 200", pwa.status === 200, `got ${pwa.status}`);
  if (pwa.status === 200) {
    const m = JSON.parse(await pwa.text());
    for (const icon of m.icons || []) {
      const res = await get(icon.src);
      note(icon.src, "PWA icon resolves", res.status === 200, `got ${res.status}`);
    }
  }

  report();
  console.log("all clear — every route accounted for");
}

main().catch((e) => { console.error(e); process.exit(1); });
