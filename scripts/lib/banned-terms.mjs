/* One parser for BANNED_TERMS, shared by every gate that reads it.

   Both gates read the array out of src/lib/brand.ts by regex rather than by
   import, because they are plain Node scripts and brand.ts is TypeScript. The
   route audit and the e2e suite each carried their own copy of that regex, and
   the copies disagreed: the audit's had been hardened (comments stripped first,
   anchored on the real terminator), the suite's had not, and the suite's
   non-greedy `\[([\s\S]*?)\]` stopped at the first close bracket it met — which
   was inside a comment reading "the retired [UN] drafts". The signed-in gate
   had been enforcing 12 of 61 terms and reporting a clean lexicon.

   A zero-length result is an error, never an empty list. "No banned terms" and
   "could not read the banned terms" must not look the same to a gate. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function parseBannedTerms(source) {
  const src = String(source)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const block = src.match(/export const BANNED_TERMS[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error("could not locate `export const BANNED_TERMS = [ ... ];` in src/lib/brand.ts");
  const terms = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (terms.length === 0) throw new Error("BANNED_TERMS parsed as empty — refusing a lexicon gate that bans nothing");
  return terms;
}

export function readBannedTerms(root) {
  return parseBannedTerms(readFileSync(join(root, "src", "lib", "brand.ts"), "utf8"));
}
