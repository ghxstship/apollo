#!/usr/bin/env node
/**
 * Walk the app as a persona and keep what each screen rendered.
 *
 *   BASE_URL=https://apollo-topaz.vercel.app \
 *   DEMO_PERSONAS='[{"name":"theo","email":"…","password":"…","routes":["/home","/passes"]}]' \
 *   node scripts/demo-walk.mjs <out-dir>
 *
 * Signs each persona in through the auth API (the same password grant the
 * e2e suite uses for the fixture personas), fetches every route with the
 * session cookie the way the suite's page() does, and writes each response
 * to <out-dir>/<persona>/<route>.html with a <base> pointing at BASE_URL so
 * the snapshot renders with production's own styles when opened locally.
 * A digest per screen (status, title, first lines of visible text) goes to
 * <out-dir>/digest.json. Read-only: nothing is posted.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL || "https://apollo-topaz.vercel.app").replace(/\/$/, "");
const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })) : {};
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REF = new URL(SUPA).hostname.split(".")[0];
const out = process.argv[2];
if (!out) { console.error("where to? node scripts/demo-walk.mjs <out-dir>"); process.exit(2); }
const personas = JSON.parse(process.env.DEMO_PERSONAS || "[]");
if (!personas.length) { console.error("DEMO_PERSONAS is empty"); process.exit(2); }

async function login(email, password) {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed for ${email}: ${res.status}`);
  return res.json();
}
const cookieFor = (session) => `sb-${REF}-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
const visible = (html) =>
  html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&rsquo;/g, "’").replace(/\s+/g, " ").trim();

/* A snapshot that stands on its own: the streamed Suspense boundaries are
   resolved in place (the hidden segment replaces its fallback, as React's
   own $RC would), every script is dropped so nothing hydrates or rewrites
   history against another origin, and root-relative assets point at the
   origin that served the page so the styles and fonts are production's. */
function freeze(html) {
  let out = html;
  const segments = [...out.matchAll(/<div hidden id="S:(\d+)">([\s\S]*?)<\/div>(?=\s*(?:<div hidden id="S:|<script|$))/g)];
  for (const m of segments) {
    const [whole, n, content] = m;
    const boundary = new RegExp(`<!--\\$\\?--><template id="B:${n}"></template>[\\s\\S]*?<!--/\\$-->`);
    if (boundary.test(out)) out = out.replace(boundary, content);
    out = out.replace(whole, "");
  }
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/(href|src|srcset)="\/(?!\/)/g, `$1="${BASE}/`);
  out = out.replace(/url\(\/(?!\/)/g, `url(${BASE}/`);
  return out;
}

const digest = [];
for (const p of personas) {
  const session = await login(p.email, p.password);
  const dir = join(out, p.name);
  mkdirSync(dir, { recursive: true });
  for (const route of p.routes) {
    const res = await fetch(BASE + route, { redirect: "manual", headers: { cookie: cookieFor(session), "user-agent": "un-demo-walk" } });
    const html = await res.text();
    const file = route === "/" ? "home" : route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");
    const snap = freeze(html);
    writeFileSync(join(dir, `${file}.html`), snap);
    const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
    const main = snap.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? snap;
    digest.push({ persona: p.name, route, status: res.status, location: res.headers.get("location"), title, text: visible(main).slice(0, 600), file: `${p.name}/${file}.html` });
    console.log(`${p.name.padEnd(6)} ${String(res.status).padEnd(4)} ${route.padEnd(28)} ${title}`);
  }
}
writeFileSync(join(out, "digest.json"), JSON.stringify(digest, null, 2));
console.log(`\n${digest.length} screens kept under ${out}`);
