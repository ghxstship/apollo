#!/usr/bin/env node
/**
 * The bundle budget. The icon wrapper shipped every Lucide glyph in one
 * 522 KB chunk to every page for weeks, and nothing measured it. This reads
 * the built client chunks and fails on two figures:
 *
 *   - any single client chunk over CHUNK_KB (a library imported whole);
 *   - the client chunks in total over TOTAL_KB (a slow creep nobody saw).
 *
 * Turbopack names its chunks by hash, so the report says the biggest by size
 * and what it looks like inside. Runs after `next build`; nothing else.
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, ".next", "static", "chunks");
const CHUNK_KB = Number(process.env.BUNDLE_CHUNK_KB || 300);
const TOTAL_KB = Number(process.env.BUNDLE_TOTAL_KB || 2600);

if (!existsSync(dir)) {
  console.error("no .next/static/chunks — run `npm run build` first");
  process.exit(1);
}
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (f.endsWith(".js")) files.push({ path: p.slice(dir.length + 1), kb: st.size / 1024 });
  }
};
walk(dir);
files.sort((a, b) => b.kb - a.kb);
const total = files.reduce((s, f) => s + f.kb, 0);

/* A hint at what a chunk is: the most frequent long identifiers in its head. */
const hint = (p) => {
  const head = readFileSync(join(dir, p), "utf8").slice(0, 20000);
  const words = head.match(/[A-Za-z_$][A-Za-z0-9_$]{7,}/g) ?? [];
  const seen = new Map();
  for (const w of words) if (!/^(TURBOPACK|globalThis|function|prototype|undefined)$/.test(w)) seen.set(w, (seen.get(w) ?? 0) + 1);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w).join(" ");
};

let failed = 0;
console.log(`client chunks: ${files.length} files, ${total.toFixed(0)} KB (budget ${TOTAL_KB} KB); largest allowed ${CHUNK_KB} KB`);
for (const f of files.slice(0, 6)) console.log(`  ${f.kb.toFixed(0).padStart(5)} KB  ${f.path}  · ${hint(f.path)}`);
for (const f of files) {
  if (f.kb > CHUNK_KB) {
    failed++;
    console.error(`✕ ${f.path} is ${f.kb.toFixed(0)} KB — over the ${CHUNK_KB} KB chunk budget (${hint(f.path)})`);
  }
}
if (total > TOTAL_KB) {
  failed++;
  console.error(`✕ client chunks total ${total.toFixed(0)} KB — over the ${TOTAL_KB} KB budget`);
}
if (failed) process.exit(1);
console.log("✓ the bundle is within budget");
