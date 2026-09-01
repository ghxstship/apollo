/* Mirror remote migrations to disk from the ledger itself, so the local file
   name and body are exactly what was applied. Guessing the timestamp by hand
   is what produced version drift three times in this session.

   This script used to `continue` when a file already existed, and print
   "exists", which reads as confirmation. It is not confirmation — it is the
   one case it never looked at. A file written by hand before the mirror ran
   was therefore never reconciled, and one of them
   (20260823151135_the_trigger_prices_the_pass_itself.sql) sat reflowed on disk
   for two days. The reflow moved a closing paren onto the previous line, and
   20260823231105 patches that same function by string-replacing against the
   applied text — so a rebuild from disk died at migration 197 of 287. The
   corpus could not reproduce its own database and nothing said so.

   So: compare, never skip.

   But do not mistake this for the real check. The ledger is NOT a faithful copy
   of the files — `statements` as recorded drops comment text and does not keep
   statement order — so a disk-to-ledger diff reports scores of differences that
   are artefacts of the recording rather than faults in the corpus, and it still
   cannot see a reflow, which is what actually broke the rebuild. Drift here is
   advisory. The authority is `npm run migrations:replay`, which runs the files
   into an empty database and looks at what comes out.

   Orphans do fail the run: a .sql file with no ledger row claims to have been
   applied and was not, and that is unambiguous. */
import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sqlCode } from "./lib/sql-code.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const args = process.argv.slice(2);
const reconcile = args.includes("--reconcile");
/* --adopt writes ledger rows that have no file, which is how a migration
   applied through the API reaches the corpus at all — the hint below always
   said "run to adopt" and no code path ever wrote one. Opt-in, because on an
   unmerged branch a missing file legitimately belongs to a sibling; adopting
   there would smuggle another branch's migration into this corpus. */
const adopt = args.includes("--adopt");
/* Ledger rows deliberately NOT in the corpus, each with its reason — adopt
   must not resurrect them. 20260825195540 is the brand check the rebuild gate
   caught (commit 44d463d): its assert runs at a position where replayed seeds
   still carry the retired brands the 20260828132337 repair only later removes,
   so it passes in the live timeline and fails every fresh replay. Its
   self-asserting replacement is 20260828132337. */
/* Was a quarantine holding 20260825195540, because adopting it turned the replay
   red. That was the right diagnosis and the wrong remedy: excluding a ledger row
   from the corpus for ever does not fix a migration that cannot replay, it hides
   it from the one check that proves this repository can rebuild its own
   database — the condition that check exists to find. The migration has been
   corrected instead (its repair matched only the Syrius era while the seeds
   write the Lyre one), so it adopts and replays like any other.

   Kept as an empty set rather than deleted: if a row ever genuinely must not be
   adopted, the reason belongs here in the open, next to this note. */
const ADOPT_NEVER = new Set([]);
// Default to the whole ledger. Passing a `since` is what hid 28 applied
// migrations from the set-equality check for a week.
const since = args.find((a) => !a.startsWith("--")) ?? "0";
const dir = join(process.cwd(), "supabase/migrations");

const s = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "e2e-staff@fixtures.invalid", password: "e2e-un-2026" }),
})).json();

const res = await fetch(`${url}/rest/v1/rpc/ledger_since`, {
  method: "POST",
  headers: { apikey: anon, Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ p_since: since }),
});
const rows = await res.json();
if (!Array.isArray(rows)) { console.error(rows); process.exit(1); }
if (rows.length === 0) { console.error("ledger returned no rows — refusing to draw conclusions"); process.exit(2); }

// The canonical on-disk form of an applied migration. Everything below is a
// comparison against this one rule, so it is stated once.
const canonical = (r) => r.statements.join(";\n\n") + ";\n";

const onDisk = new Set(readdirSync(dir).filter((f) => f.endsWith(".sql")));
const wrote = [], drift = [], missing = [], reconciled = [];
let exact = 0;

for (const r of rows) {
  const name = `${r.version}_${r.name}.sql`;
  const file = join(dir, name);
  onDisk.delete(name);
  if (!existsSync(file)) {
    if (adopt && !ADOPT_NEVER.has(name)) { writeFileSync(file, canonical(r)); wrote.push(name); }
    else if (!ADOPT_NEVER.has(name)) missing.push(name);
    continue;
  }
  const want = canonical(r), have = readFileSync(file, "utf8");
  if (want === have) { exact++; continue; }
  if (reconcile) { writeFileSync(file, want); reconciled.push(name); continue; }
  // Compare code only. Comment differences are the ledger's lossiness, not the
  // file's fault, and reconciling them would delete prose worth more than the
  // bytes. Whitespace *inside* code is still significant — that is the class
  // that breaks string-patch anchors — so sqlCode preserves it.
  if (sqlCode(want) !== sqlCode(have)) drift.push({ name, want: sqlCode(want), have: sqlCode(have) });
}

// A .sql file with no ledger row claims to have been applied and was not.
const orphans = [...onDisk];

console.log(`${exact} byte-exact, ${drift.length} drifted, ${missing.length} unmirrored, ${orphans.length} orphaned`);
for (const n of wrote.concat(reconciled)) console.log("  wrote     ", n);

if (missing.length) {
  // Not necessarily an error: a sibling branch legitimately owns migrations
  // that this worktree has not merged. Loud, because it is also how a file
  // goes missing entirely.
  console.log(`\n${missing.length} applied migration(s) have no file in this worktree:`);
  for (const n of missing) console.log("  unmirrored", n);
  console.log("  (expected on a branch that has not merged them; run with a clean tree to adopt)");
}

if (drift.length) {
  console.log(`\n${drift.length} file(s) differ in code from what the ledger recorded:`);
  for (const d of drift) {
    const w = d.want.split("\n"), h = d.have.split("\n");
    let i = 0; while (i < w.length && w[i] === h[i]) i++;
    console.log(`\n  ${d.name}`);
    console.log(`    ledger line ${i + 1}: ${JSON.stringify(w[i] ?? "(end of file)")}`);
    console.log(`    disk   line ${i + 1}: ${JSON.stringify(h[i] ?? "(end of file)")}`);
  }
  console.log("\nAdvisory only — the ledger drops comments and reorders statements, so");
  console.log("most of these are recording artefacts. Run `npm run migrations:replay` to");
  console.log("find out whether the corpus can actually rebuild the database.");
}
if (orphans.length) {
  console.error(`\n${orphans.length} file(s) on disk were never applied:`);
  for (const n of orphans) console.error("  orphan    ", n);
}

process.exit(orphans.length ? 1 : 0);
