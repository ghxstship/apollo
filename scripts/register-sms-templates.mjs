/* register-sms-templates — pushes the club's SMS template drafts to sent.dm.
 *
 * The drafts live in public.sms_templates (draft_body, parameter_map,
 * variable_samples); this script is only plumbing, so re-wording a template
 * never means editing code. It is idempotent: a template whose name already
 * exists at sent.dm is left alone and its id is recorded locally.
 *
 * sent.dm creation is gated on account onboarding — until the account reads
 * ONBOARDED (WhatsApp Business connected), every create returns VALIDATION_001
 * with no details. The script recognises that signature and says so plainly
 * instead of printing fourteen identical opaque errors.
 *
 *   SENT_API_KEY=... STAFF_EMAIL=... STAFF_PASSWORD=... \
 *     node scripts/register-sms-templates.mjs [--dry] [--submit]
 *
 *   --dry     print the payloads, send nothing
 *   --submit  also submit each created template for review
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* env provided externally */ }

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SENT_KEY = process.env.SENT_API_KEY;
const STAFF_EMAIL = process.env.STAFF_EMAIL || "skipper@lyre.social";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD;
const DRY = process.argv.includes("--dry");
const SUBMIT = process.argv.includes("--submit");
const SENT = "https://api.sent.dm/v3";

if (!SENT_KEY && !DRY) { console.error("SENT_API_KEY not set (it lives in Supabase Vault — pass it in the environment)."); process.exit(2); }
if (!STAFF_PASSWORD) { console.error("STAFF_PASSWORD not set — sms_templates is staff-only under RLS."); process.exit(2); }

/* ---------- read the registry as staff ---------- */
const auth = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
}).then((r) => r.json());
if (!auth.access_token) { console.error(`staff login failed: ${JSON.stringify(auth).slice(0, 160)}`); process.exit(2); }

const rows = await fetch(
  `${SUPA}/rest/v1/sms_templates?select=*&active=eq.true&order=tier,code`,
  { headers: { apikey: ANON, authorization: `Bearer ${auth.access_token}` } },
).then((r) => r.json());

/* ---------- draft -> sent.dm definition ---------- */
/* draft_body carries {{name}} placeholders; sent.dm wants {{index:variable}}
   plus a variables array whose names match what the send passes as parameters. */
function toDefinition(row) {
  const names = [];
  const template = row.draft_body.replace(/\{\{([a-z_]+)\}\}/g, (_, name) => {
    let i = names.indexOf(name);
    if (i === -1) { names.push(name); i = names.length - 1; }
    return `{{${i}:variable}}`;
  });
  const missing = names.filter((n) => !(row.variable_samples ?? {})[n]);
  if (missing.length) throw new Error(`no sample for {{${missing.join("}}, {{")}}}`);
  return {
    body: {
      multiChannel: {
        type: "text",
        template,
        variables: names.map((name, id) => ({
          id, name, type: "variable",
          props: { variableType: "text", sample: String(row.variable_samples[name]) },
        })),
      },
    },
    definitionVersion: "1.0",
  };
}

/* ---------- idempotency: what already exists at sent.dm ---------- */
let existing = new Map();
if (!DRY) {
  const listed = await fetch(`${SENT}/templates?pageSize=100`, { headers: { "x-api-key": SENT_KEY } }).then((r) => r.json());
  existing = new Map((listed?.data?.templates ?? []).map((t) => [t.name, t]));
}

/* ---------- register ---------- */
let created = 0, present = 0, blocked = 0, errored = 0;
const gatePattern = /VALIDATION_001/;

for (const row of rows) {
  const name = row.provider_template_name;
  let definition;
  try { definition = toDefinition(row); }
  catch (e) { console.error(`  ✕ ${row.code}: ${e.message}`); errored++; continue; }

  if (DRY) {
    console.log(`\n— ${row.code} -> ${name} (tier ${row.tier}, ${row.audience})`);
    console.log(JSON.stringify({ category: row.code === "verify-code" ? "AUTHENTICATION" : "UTILITY", language: "en_US", definition, submit_for_review: SUBMIT }, null, 2));
    continue;
  }

  if (existing.has(name)) {
    const t = existing.get(name);
    console.log(`  = ${row.code}: already at sent.dm (${t.status}) — recording id`);
    await fetch(`${SUPA}/rest/v1/sms_templates?code=eq.${row.code}`, {
      method: "PATCH",
      headers: { apikey: ANON, authorization: `Bearer ${auth.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ provider_template_id: t.id }),
    });
    present++;
    continue;
  }

  const res = await fetch(`${SENT}/templates`, {
    method: "POST",
    headers: { "x-api-key": SENT_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      category: row.code === "verify-code" ? "AUTHENTICATION" : "UTILITY",
      language: "en_US",
      definition,
      submit_for_review: SUBMIT,
    }),
  });
  const out = await res.json().catch(() => ({}));

  if (res.ok && out?.data?.id) {
    console.log(`  + ${row.code}: created ${out.data.id} (${out.data.status})`);
    await fetch(`${SUPA}/rest/v1/sms_templates?code=eq.${row.code}`, {
      method: "PATCH",
      headers: { apikey: ANON, authorization: `Bearer ${auth.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ provider_template_id: out.data.id }),
    });
    created++;
  } else if (gatePattern.test(JSON.stringify(out)) && !out?.error?.details) {
    console.log(`  ○ ${row.code}: blocked by account onboarding (finish WhatsApp Business setup, then re-run)`);
    blocked++;
  } else {
    console.error(`  ✕ ${row.code}: ${res.status} ${JSON.stringify(out?.error ?? out).slice(0, 220)}`);
    errored++;
  }
}

if (!DRY) {
  console.log(`\n${rows.length} drafts: ${created} created, ${present} already present, ${blocked} blocked on onboarding, ${errored} errors`);
  if (blocked === rows.length - present - created) {
    console.log("The account gate is the only obstacle — nothing here needs changing.");
  }
  process.exit(errored ? 1 : 0);
}
