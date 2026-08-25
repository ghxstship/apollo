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
// Default to the whole ledger. Passing a `since` is what hid 28 applied
// migrations from the set-equality check for a week.
const since = args.find((a) => !a.startsWith("--")) ?? "0";
const dir = join(process.cwd(), "supabase/migrations");

const s = await (await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "e2e-staff@syrius.social", password: "e2e-lyre-2026" }),
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
  if (!existsSync(file)) { missing.push(name); continue; }
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
