/* Does the app obey its own type system?

   Two rules from docs/brand/_handoff/readme.md §50, both of which had drifted:

     LADDER   "canonical scale 9/10/12/14/16/18/22/28/36/48/64 — no off-scale
              sizes at or below 64px". Read out of tokens.css rather than
              hardcoded here, so the check cannot disagree with the tokens.

     ANTON    "Anton for display >=22px, ALL CAPS always (via text-transform)".

   Both were measured rather than asserted, and both were wrong when measured:
   the ladder had off-scale sizes in the DS kit's own inline styles, and nine
   display rules at 22px and above rendered in mixed case. A positive control in
   a browser confirmed the second — an element known to be uppercased reported
   `uppercase` while .ws-dp-row__t at 22px Anton reported `none`.

   EXEMPTIONS are the readme's own, not conveniences: the Wordmark lockup,
   poster scale above 64px, scaled artboards, and logo specimens. Plus token
   DEFINITIONS — :root declares --type-display with a "/* ALL CAPS *\/" note and
   the consumer applies the transform, so the definition itself is not a
   rendered rule. That last one was a false positive in the first version of
   this check, and it is excluded by name rather than by loosening the rule. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const ladder = new Set([...tokens.matchAll(/--text-[a-z0-9]+\s*:\s*([0-9.]+)px/g)].map((m) => m[1] + "px"));
const SIZE = Object.fromEntries(
  [...tokens.matchAll(/(--text-[a-z0-9]+)\s*:\s*([0-9.]+)px/g)].map((m) => [m[1], +m[2]])
);
if (ladder.size === 0) { console.error("could not read the type ladder from tokens.css"); process.exit(2); }

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|tsx)$/.test(f)) files.push(p);
  }
})("src");

const offLadder = [], notCaps = [];
const EXEMPT = /wordmark|specimen|poster|artboard/i;

for (const p of files) {
  const src = readFileSync(p, "utf8");
  for (const m of src.matchAll(/font-size:\s*([0-9.]+px)/g)) if (!ladder.has(m[1])) offLadder.push(`${p}  ${m[1]}`);
  for (const m of src.matchAll(/font:\s*[^;{]*?\b([0-9.]+px)\b/g)) if (!ladder.has(m[1])) offLadder.push(`${p}  ${m[1]}`);

  if (!p.endsWith(".css")) continue;
  for (const m of src.matchAll(/([^{}]+)\{([^}]*font[^}]*--font-display[^}]*)\}/g)) {
    const sel = m[1].trim().split("\n").pop(), body = m[2];
    if (EXEMPT.test(sel) || sel === ":root") continue;
    const size = Math.max(0,
      ...[...body.matchAll(/(\d+)px/g)].map((x) => +x[1]),
      ...[...body.matchAll(/var\((--text-[a-z0-9]+)\)/g)].map((x) => SIZE[x[1]] ?? 0));
    if (size >= 22 && !/text-transform\s*:\s*uppercase/.test(body)) notCaps.push(`${p}  ${sel}  ${size}px`);
  }
}

for (const o of offLadder) console.error("  off-ladder  " + o);
for (const n of notCaps) console.error("  not ALL CAPS  " + n);
const bad = offLadder.length + notCaps.length;
console.log(bad === 0
  ? `type system: on-ladder and ALL CAPS throughout (ladder ${[...ladder].length} rungs)`
  : `type system: ${offLadder.length} off-ladder, ${notCaps.length} display rules not ALL CAPS`);
process.exit(bad ? 1 : 0);
