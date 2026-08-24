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
 * Runs in CI on every push and on a daily schedule (.github/workflows/route-audit.yml).
 * Exits non-zero if anything fails; writes route-audit-report.json.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "src", "lib", "route-manifest.json"), "utf8"));

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

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

/* Brand lexicon guard, read from the source of truth. This used to be a
   hand-copied list matched case-sensitively against raw HTML — the exact
   failure the e2e suite was rewritten to avoid. The copies agreed, but the
   casing did not: "Shore office" is banned and /support rendered "Shoreside —
   the shore office" on every load, past both gates. */
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

/* Every key an email template reads must be a key something actually writes.
   `season-card` read `p["charters"]`; the payload has always carried
   `sailings`; nothing has ever written `charters`. So `esc(value ?? 0)`
   printed the number nought and stated it as fact, and every season card ever
   sent told its member they had made 0 SAILINGS. Fourteen went out for real.
   Nothing could have caught that: the audit reads rendered web pages, and an
   email template is not a web page.

   Note for whoever edits this: the first version of this extractor matched
   jsonb_build_object with a non-greedy paren, which stops at the first `)` —
   so `to_jsonb(c.marks_won)` truncated the argument list and it reported three
   keys as unwritten that are written on the very next line. Balanced-paren
   scan, and it is worth re-proving by breaking it rather than trusting green. */
function jsonbObjects(src) {
  const out = [];
  const re = /jsonb_build_object\s*\(/g;
  while (re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}

function emailTemplatesReadOnlyWrittenKeys() {
  let tpl;
  try {
    tpl = readFileSync(join(root, "supabase/functions/send-outbox/index.ts"), "utf8");
  } catch {
    return; /* the function is not in this checkout */
  }
  const read = new Set([...tpl.matchAll(/\bp\[\s*"([^"]+)"\s*\]/g)].map((m) => m[1]));
  const written = new Set();
  const migrations = join(root, "supabase/migrations");
  for (const f of readdirSync(migrations)) {
    for (const body of jsonbObjects(readFileSync(join(migrations, f), "utf8"))) {
      for (const k of body.matchAll(/'([a-z_][a-z0-9_]*)'\s*,/gi)) written.add(k[1]);
    }
  }
  /* Payloads are built in TypeScript too. */
  for (const file of sourceFiles(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("email_outbox")) continue;
    for (const k of src.matchAll(/\b([a-z_][a-z0-9_]*)\s*:/gi)) written.add(k[1]);
  }
  const orphans = [...read].filter((k) => !written.has(k)).sort();
  note("supabase/functions/send-outbox", "every template key is a key something writes",
    orphans.length === 0, orphans.length ? `read but never written: ${orphans.join(", ")}` : "");
}

function sourceInvariants() {
  pagesHaveALanding();
  emailTemplatesReadOnlyWrittenKeys();
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
  const res = await fetch(BASE + path, { redirect, headers: { "user-agent": "lyre-route-audit" } });
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

async function main() {
  console.log(`auditing ${BASE}\n`);
  sourceInvariants();

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
    note(r.path, "slug source non-empty", slugs.length > 0, `${slugs.length} slugs`);
    for (const s of slugs) pages.push({ path: r.path.replace(/\[[^\]]+\]/, s), access: r.access });
    // Unknown slugs must 404, never 500.
    const missing = await get(r.path.replace(/\[[^\]]+\]/, "__audit-missing__"));
    note(r.path, "unknown slug returns 404", missing.status === 404, `got ${missing.status}`);
  }

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
      // Signed out, every member surface must bounce to the gangway.
      const ok = res.status >= 300 && res.status < 400 && (res.headers.get("location") || "").includes("/gangway");
      note(path, "redirects signed-out to /gangway", ok, `status ${res.status} → ${res.headers.get("location")}`);
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

  // Report.
  const passed = results.filter((r) => r.ok).length;
  writeFileSync(join(root, "route-audit-report.json"), JSON.stringify({ base: BASE, checkedAt: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  console.log(`\n${passed}/${results.length} checks passed`);
  if (failures.length) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(`  ✕ ${f.route} — ${f.check}${f.detail ? ` (${f.detail})` : ""}`);
    process.exit(1);
  }
  console.log("all clear — every route accounted for");
}

main().catch((e) => { console.error(e); process.exit(1); });
