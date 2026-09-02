#!/usr/bin/env node
/**
 * Reset the e2e fixtures to clean water.
 *
 * The five personas (e2e-*@fixtures.invalid) share the production project
 * with the demo members and the real roll, and every e2e run leaves residue
 * the suite cannot sweep — the ledgers, the inbox and the outboxes have no
 * DELETE policy for staff. After a season of runs a fixture card reads a
 * five-figure balance and a 999-deep inbox. This puts them back to zero.
 *
 * Everything happens inside one definer function, reset_the_fixtures(),
 * gated on the staff badge and scoped to the exact fixture-address shape —
 * demo members and real members are never matched. The migration that
 * carries the function documents the order it deletes in and why.
 *
 * Usage: E2E_PASSWORD=… node scripts/reset-fixtures.mjs
 * (reads NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY from the env or .env.local)
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
} catch { /* CI provides env */ }

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PASSWORD = process.env.E2E_PASSWORD;
const STAFF = process.env.STAFF_EMAIL || "e2e-staff@fixtures.invalid";
if (!SUPA || !ANON) { console.error("NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY not set."); process.exit(2); }
if (!PASSWORD) { console.error("E2E_PASSWORD not set — the reset signs in as the staff persona."); process.exit(2); }

const login = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { "content-type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: STAFF, password: PASSWORD }),
});
if (!login.ok) { console.error(`sign-in failed for ${STAFF}: ${login.status} ${await login.text()}`); process.exit(1); }
const session = await login.json();

const res = await fetch(`${SUPA}/rest/v1/rpc/reset_the_fixtures`, {
  method: "POST",
  headers: {
    apikey: ANON,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
  },
  body: "{}",
});
const text = await res.text();
if (!res.ok) { console.error(`reset refused: ${res.status} ${text}`); process.exit(1); }

const out = JSON.parse(text);
const counts = Object.entries(out.counts ?? {}).sort((a, b) => b[1] - a[1]);
console.log(`\n${out.personas} personas reset to clean water\n`);
for (const [table, n] of counts) console.log(`  ${String(n).padStart(6)}  ${table}`);
if ((out.skipped ?? []).length) console.log(`\n  skipped (table or column gone): ${out.skipped.join(", ")}`);
console.log("");
