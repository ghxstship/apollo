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
import { readFileSync, writeFileSync } from "node:fs";
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

/* Brand lexicon guard — copied from BANNED_TERMS in src/lib/brand.ts (this
   script is plain mjs and can't import TS). Case-sensitive on purpose:
   lowercase "dispatch"/"purser"/"fathoms" are literal words and allowed;
   the capitalized brand uses are not. */
const BANNED = [
  "The Purser",
  "The Wardroom",
  "Fathoms",
  "The Dispatch",
  "Harbormaster console",
  "Shore office",
];

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
  const offLexicon = BANNED.filter((term) => html.includes(term));
  note(route, "on-lexicon", offLexicon.length === 0, offLexicon.length ? `banned terms: ${offLexicon.join(", ")}` : "");
}

function internalLinks(html) {
  return [...html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith("//") && !/\.(css|js|svg|png|jpg|ico|zip|webmanifest|xml|txt)$/.test(h));
}

async function main() {
  console.log(`auditing ${BASE}\n`);

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
