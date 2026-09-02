#!/usr/bin/env node
/**
 * Freeze the signing library into src/app/preview/documents/snapshot.json.
 *
 * /preview/documents reads live only when SUPABASE_SERVICE_ROLE_KEY is set,
 * which is not the normal case — so the page almost always serves this file.
 * It was first written by hand, which meant the e2e gate that checks it for
 * drift could tell a reviewer to "regenerate the snapshot" when nothing in the
 * repo could. A gate that names a remedy the product does not have is the same
 * defect as a banner offering a resume that does not exist.
 *
 * Reads through published_version() and render_document() rather than composing
 * from document_versions directly: published_version() is the one call that
 * encodes which version is actually binding, and since it also filters on
 * documents.active, going around it would freeze copy no member can reach.
 *
 * Auth follows scripts/mirror-migrations.mjs — a staff session over REST,
 * because both RPCs are granted to `authenticated` and revoked from anon. The
 * password comes from the environment; it is not written into this file.
 *
 *   E2E_PASSWORD='…' npm run documents:snapshot
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src/app/preview/documents/snapshot.json");

/* Read .env.local rather than requiring the caller to source it — every other
   entry point here is `npm run <thing>` with no preamble, and a script that
   silently needs `set -a` is a script people run wrong once. */
for (const line of existsSync(join(root, ".env.local"))
  ? readFileSync(join(root, ".env.local"), "utf8").split("\n")
  : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.E2E_EMAIL || "e2e-staff@fixtures.invalid";
const password = process.env.E2E_PASSWORD;

if (!url || !anon) die("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
if (!password) die("E2E_PASSWORD must be set — the library is staff-readable only");

/* A Port Day assembles clauses a Sea Day does not. Both are rendered, and the
   same de-duplication data.ts applies is applied here, so the frozen file holds
   exactly the renderings the live path would produce — no more, no fewer. */
const CONTEXTS = ["sea", "shore"];

function die(msg) {
  console.error(`snapshot-documents: ${msg}`);
  process.exit(1);
}

/* PostgREST answers an unnamed-parameter mistake with a 404 BODY rather than
   throwing, so an unguarded caller carries an error object forward as data and
   produces confident, uniform fiction. Every response is shape-checked here. */
async function post(path, token, body) {
  const res = await fetch(`${url}${path}`, {
    method: "POST",
    headers: {
      apikey: anon,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { die(`${path} returned non-JSON: ${text.slice(0, 200)}`); }
  if (!res.ok) die(`${path} → ${res.status} ${text.slice(0, 200)}`);
  if (data && typeof data === "object" && !Array.isArray(data) && data.code && data.message) {
    die(`${path} → ${data.code} ${data.message}`);
  }
  return data;
}

async function get(path, token) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) die(`${path} → ${res.status} ${text.slice(0, 200)}`);
  const data = JSON.parse(text);
  if (!Array.isArray(data)) die(`${path} did not return rows: ${text.slice(0, 200)}`);
  return data;
}

const session = await post("/auth/v1/token?grant_type=password", null, { email, password });
const token = session?.access_token;
if (!token) die("sign-in returned no access_token");

const staff = await post("/rest/v1/rpc/viewer_is_staff", token, {});
if (staff !== true) die(`${email} is not staff — the clause library is not readable`);

/* Ordered exactly as the live path orders it (data.ts: .order("audience")
   .order("code")), so the page presents the same sequence whether it is reading
   the database or this file. They disagreed while this was hand-written. */
const documents = await get(
  "documents?select=code,title,kind,audience,validity_months&active=eq.true&order=audience,code",
  token
);

const frozen = [];
let newestWording = "";
for (const doc of documents) {
  const versionId = await post("/rest/v1/rpc/published_version", token, { p_document_code: doc.code });
  if (!versionId) { console.warn(`  skip ${doc.code} — no published version`); continue; }
  if (typeof versionId !== "string") die(`published_version(${doc.code}) returned ${typeof versionId}`);

  const [version] = await get(`document_versions?select=version,effective_from&id=eq.${versionId}`, token);
  const gates = (await get(`document_requirements?select=gate&document_code=eq.${doc.code}`, token))
    .map((r) => r.gate)
    .sort();

  const composed = await get(
    `document_clauses?select=position,condition,clause_versions(version,clause_code,published_at,clauses(title,category))` +
      `&document_version_id=eq.${versionId}&order=position`,
    token
  );

  /* The date the banner shows is derived from the rows that end up IN this
     file, never from a separate query. An unscoped "newest clause_version"
     read counts wording no reviewer can reach — five clause versions here
     belong to no active document, and they are the newest in the table, so the
     banner would have claimed a currency date from copy nobody can open. Same
     lesson as resolving through published_version() rather than around it:
     scope the answer to what the reader can actually see. */
  for (const row of composed) {
    const at = row.clause_versions?.published_at;
    if (at && at > newestWording) newestWording = at;
  }
  /* A document republished with no new clause text still changed what it says,
     by changing which clauses it holds. */
  if (version?.effective_from && version.effective_from > newestWording) {
    newestWording = version.effective_from;
  }

  const renderings = [];
  for (const setting of CONTEXTS) {
    const body = await post("/rest/v1/rpc/render_document", token, {
      p_document_version_id: versionId,
      /* The wire key stays `class`: document_clauses.condition is keyed that
         way and render_document matches by containment. */
      p_context: { class: setting },
    });
    if (!body) continue;
    if (typeof body !== "string") die(`render_document(${doc.code}, ${setting}) returned ${typeof body}`);
    if (renderings.some((r) => r.body === body)) continue;

    /* The same containment test the renderer applies, so the manifest lists the
       clauses this rendering actually holds rather than every candidate. */
    const clauses = composed
      .filter((row) => Object.entries(row.condition ?? {}).every(([k, v]) => k === "class" && v === setting))
      .map((row) => ({
        clause_code: row.clause_versions?.clause_code ?? "",
        title: row.clause_versions?.clauses?.title ?? "",
        category: row.clause_versions?.clauses?.category ?? "",
        version: row.clause_versions?.version ?? 0,
        position: row.position,
        condition: row.condition ?? {},
      }));

    renderings.push({ setting, body, clauses });
  }
  if (renderings.length === 0) { console.warn(`  skip ${doc.code} — renders empty`); continue; }

  frozen.push({
    code: doc.code,
    title: doc.title,
    kind: doc.kind,
    audience: doc.audience,
    validity_months: doc.validity_months,
    version: version?.version ?? 0,
    effective_from: version?.effective_from ?? "",
    gates,
    renderings,
  });
}

if (frozen.length === 0) die("nothing to freeze — refusing to write an empty snapshot");

/* Not the clock: the banner says when the WORDING was last current, not when
   somebody happened to run this. A clock date conflates "checked" with
   "changed", and for binding copy the claim a reviewer needs is "this has been
   in force since X". Derived above from the frozen rows themselves, so the date
   cannot disagree with the file it sits on. */
const payload = {
  generatedAt: (newestWording || new Date().toISOString()).slice(0, 10),
  source: `supabase ${new URL(url).hostname.split(".")[0]} · render_document() over published versions`,
  documents: frozen,
};

/* Compare canonically, not textually. A raw string compare is key-order
   sensitive: re-emit the same data with `clauses` before `body` and it reads as
   a change, rewrites the file and moves the banner date — announcing a review
   that never happened. That bug was written and caught in a parallel session
   an hour ago; this is the same guard, arrived at the other way. */
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])]))
      : v;

const json = JSON.stringify(payload, null, 2) + "\n";
let unchanged = false;
if (existsSync(out)) {
  try {
    unchanged =
      JSON.stringify(canonical(JSON.parse(readFileSync(out, "utf8")))) ===
      JSON.stringify(canonical(payload));
  } catch { /* unparseable on disk — rewrite it */ }
}
if (unchanged) {
  console.log(`snapshot: up to date (${frozen.length} documents, ${frozen.reduce((n, d) => n + d.renderings.length, 0)} renderings, wording current to ${newestWording})`);
} else {
  writeFileSync(out, json);
  console.log(`snapshot: wrote ${frozen.length} documents, ${frozen.reduce((n, d) => n + d.renderings.length, 0)} renderings, wording current to ${newestWording}`);
}
