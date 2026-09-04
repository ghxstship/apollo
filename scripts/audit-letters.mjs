#!/usr/bin/env node
/**
 * Letter audit — the registry, the sender and the callers, held in agreement.
 * Runs offline: nothing is fetched, nothing is sent. The same checks run
 * inside the route audit's source pass; this is the way to run them alone.
 *
 * Usage:  node scripts/audit-letters.mjs [--verbose]
 * Exits non-zero if anything fails.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readBannedTerms } from "./lib/banned-terms.mjs";
import { letterInvariants } from "./lib/letters.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");

const results = [];
const failures = [];
const note = (where, check, ok, detail = "") => {
  results.push({ where, check, ok, detail });
  if (!ok) failures.push({ where, check, detail });
  if (verbose) console.log(`  ${ok ? "✓" : "✕"} ${where} — ${check}${detail ? ` (${detail})` : ""}`);
};

letterInvariants({ root, note, banned: readBannedTerms(root) });

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} letter checks passed`);
if (failures.length) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  ✕ ${f.where} — ${f.check}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("all clear — every letter accounted for");
