#!/usr/bin/env node
/* The localization ratchet.
 *
 * The audit put the extraction at 2,700–3,500 user-facing strings across 335
 * of 442 source files, and the owner's ruling is that the Global standing
 * sells from launch, with localization, and without shortcuts that create
 * rework. Six to ten weeks of work, then — which is exactly the shape of
 * project that stalls, because nothing makes the middle of it visible and
 * nothing stops a new hard-coded sentence landing beside an extracted one.
 *
 * So this does not check that the work is DONE. It checks that it never goes
 * BACKWARDS. Every area carries a count in i18n-baseline.json; a commit that
 * raises one fails, a commit that lowers one is asked to write the lower
 * number down. Progress becomes monotonic, the remaining work has a number on
 * it, and the day the last string moves the baseline is zeroes.
 *
 * WHAT COUNTS AS A USER-FACING STRING. A JSX text node with two or more
 * letters, or a string literal in an attribute a person reads — aria-label,
 * placeholder, title, alt, label. Deliberately not every string in the
 * codebase: a className, a route, a database column and a template code are
 * all strings and none of them is language.
 *
 * The count is a PROXY and does not have to be exact. It has to be stable,
 * so the same source always produces the same number, and directional, so
 * removing a hard-coded sentence always lowers it. Both hold.
 *
 * Usage:  node scripts/audit-i18n.mjs            check against the baseline
 *         node scripts/audit-i18n.mjs --write    record the current counts
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const BASELINE = join(ROOT, "scripts/i18n-baseline.json");

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* Comments blanked to spaces, newlines kept, so a sentence explaining a
   sentence is not counted as one. */
function stripComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      out += " ".repeat(stop - i);
      i = stop;
    } else if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

function areaOf(rel) {
  if (rel.startsWith("src/app/(site)/")) return "site";
  if (rel.startsWith("src/app/(member)/")) return "member";
  if (rel.startsWith("src/app/(staff)/")) return "staff";
  if (/^src\/app\/(gangway|sign|auth|w)\//.test(rel)) return "gangway";
  if (rel.startsWith("src/components/ds/")) return "design-system";
  if (rel.startsWith("src/components/")) return "components";
  if (rel.startsWith("src/lib/")) return "lib";
  return "app-root";
}

/* Attributes a person reads. `title` is here because a browser shows it and a
   screen reader may read it; `alt` because it is the image's whole text. */
const HUMAN_ATTRS = /\b(aria-label|aria-description|placeholder|title|alt|label|pendingLabel|eyebrow|legend)\s*=\s*["']([^"']{2,})["']/g;

/* A JSX text node: between a `>` and a `<`, containing at least two letters in
   a row.

   TWO GUARDS, both learned the hard way on the first commit this gate ran
   against. TypeScript looks enough like JSX to fool a regex:

     `) => PromiseLike<{ data: unknown }>`  — the `>` of the arrow, then a word,
     then the `<` of a generic. Counted as a sentence, and the gate failed a
     commit that had added no copy at all.

   So: the text node is only looked for in `.tsx`, and a `>` preceded by `=` or
   `-` is an arrow or an operator rather than the end of a tag. Both are cheap
   and both are exact. What remains is a proxy — it does not have to be right
   about every string, it has to be STABLE, so the same source always gives the
   same number, and DIRECTIONAL, so removing a hard-coded sentence always
   lowers it. */
const JSX_TEXT = /(^|[^=\-])>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g;

function countIn(src, isTsx) {
  const clean = stripComments(src);
  let n = 0;
  if (isTsx) {
    for (const m of clean.matchAll(JSX_TEXT)) {
      const text = m[2].trim();
      if (!text) continue;
      /* Entities and punctuation runs are not sentences. */
      if (!/[A-Za-z]{2,}/.test(text.replace(/&[a-z]+;/gi, ""))) continue;
      n += 1;
    }
  }
  n += [...clean.matchAll(HUMAN_ATTRS)].length;
  return n;
}

const files = walk(join(ROOT, "src")).filter((p) => p.endsWith(".tsx") || p.endsWith(".ts"));
const counts = {};
for (const p of files) {
  const rel = relative(ROOT, p);
  let src;
  try { src = readFileSync(p, "utf8"); } catch { continue; }
  const n = countIn(src, p.endsWith(".tsx"));
  if (!n) continue;
  const area = areaOf(rel);
  counts[area] = (counts[area] ?? 0) + n;
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

/* ── the invariants that are not counts ───────────────────────────────────── */

const structural = [];
const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
structural.push({
  what: "the page declares a negotiated language, not a literal",
  ok: /lang=\{/.test(layout) && !/lang="[a-z]{2}"/i.test(layout),
  detail: 'src/app/layout.tsx must set lang={locale} — a literal lang is a page that is always English',
});
structural.push({
  what: "the page declares its direction",
  ok: /dir=\{/.test(layout),
  detail: "without dir, a right-to-left locale renders its layout the wrong way round",
});

/* Physical CSS properties mirror wrongly under RTL. The audit counted 232
   logical against 9 physical, of which exactly one is a real directional
   decision — so this is nearly done and worth holding. */
const cssFiles = walk(join(ROOT, "src")).filter((p) => p.endsWith(".css"));
const PHYSICAL = /(?:^|[;{\s])(margin|padding|border)-(left|right)\s*:|(?:^|[;{\s])(left|right)\s*:(?!\s*0)/g;
let physical = 0;
for (const p of cssFiles) {
  const src = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  physical += [...src.matchAll(PHYSICAL)].length;
}

/* ── report ───────────────────────────────────────────────────────────────── */

const current = { areas: counts, total, physicalCss: physical };

if (process.argv.includes("--write")) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
  console.log(`baseline written — ${total} user-facing strings, ${physical} physical CSS properties`);
  process.exit(0);
}

let base;
try {
  base = JSON.parse(readFileSync(BASELINE, "utf8"));
} catch {
  console.error("no i18n baseline on file — run: node scripts/audit-i18n.mjs --write");
  process.exit(1);
}

let failed = 0;
console.log(`localization — ${total} user-facing strings across ${Object.keys(counts).length} areas\n`);
const areas = new Set([...Object.keys(base.areas ?? {}), ...Object.keys(counts)]);
for (const area of [...areas].sort()) {
  const was = base.areas?.[area] ?? 0;
  const now = counts[area] ?? 0;
  const delta = now - was;
  const mark = delta > 0 ? "FAIL" : delta < 0 ? "down" : "ok  ";
  if (delta > 0) failed++;
  console.log(
    `${mark}  ${area.padEnd(14)} ${String(now).padStart(5)}` +
      (delta === 0 ? "" : `   ${delta > 0 ? "+" : ""}${delta} against the baseline`),
  );
}
const cssDelta = physical - (base.physicalCss ?? 0);
if (cssDelta > 0) failed++;
console.log(
  `${cssDelta > 0 ? "FAIL" : cssDelta < 0 ? "down" : "ok  "}  ${"physical CSS".padEnd(14)} ${String(physical).padStart(5)}` +
    (cssDelta === 0 ? "" : `   ${cssDelta > 0 ? "+" : ""}${cssDelta} against the baseline`),
);

for (const s of structural) {
  if (!s.ok) failed++;
  console.log(`\n${s.ok ? "ok  " : "FAIL"}  ${s.what}`);
  if (!s.ok) console.log(`        ${s.detail}`);
}

if (failed) {
  console.log(
    `\n${failed} check(s) failing.\n` +
      "A hard-coded user-facing string was added, or a physical CSS property was.\n" +
      "Both are rework: the string will have to be extracted and the property mirrored.\n\n" +
      "This number is a DEBT LEDGER, not a ban on writing copy. Three honest answers:\n" +
      "  · The copy is new and needed — write the debt down and move on:\n" +
      "      node scripts/audit-i18n.mjs --write\n" +
      "    The baseline is a committed file, so raising it is a visible diff somebody\n" +
      "    reviews. That visibility is the whole mechanism; a silent rise is what this\n" +
      "    gate exists to stop, not a deliberate one.\n" +
      "  · The copy could go through a catalog instead — do that, and the count falls.\n" +
      "  · You lowered a count by extracting something — record it the same way.",
  );
  process.exit(1);
}
console.log("\nnothing went backwards");
