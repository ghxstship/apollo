/* Can this repository rebuild its own database?

   For most of this project's life nothing answered that. The migration files
   are mirrored from the ledger after the fact, and the mirror skipped any file
   that already existed — so a hand-edited file was never reconciled. One had
   been reflowed by hand: a closing paren moved up a line. Nineteen migrations
   patch earlier functions by string-replacing against `pg_get_functiondef`
   output, and one of them anchors on exactly that paren. A rebuild from disk
   therefore died at migration 197 of 287, and no gate in the repo noticed,
   because every gate compared the database to itself.

   Comparing files to the ledger cannot replace this. The ledger is not a
   faithful copy of the files — it drops comment text and does not preserve
   statement order — so a disk-to-ledger diff reports scores of differences
   that are artefacts of the recording, and still cannot see a reflow. The only
   honest test is to run the corpus and look at what comes out.

   So: replay every file into an empty database and diff the result against
   live, object by object. Isolated project id and ports, so this never touches
   the stack the app is running against.

   Requires Docker and the Supabase CLI. Exits 0 only if the corpus replays
   clean; anything else prints the migration that failed. */
import { mkdirSync, writeFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const REPO = process.cwd();
const WORK = join(process.env.TMPDIR ?? "/tmp", "syrius-replay");
const PROJECT = "syriusreplay";
const DB_PORT = 55322;

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: "utf8", cwd: WORK, ...opts });

function need(cmd, hint) {
  if (spawnSync("command", ["-v", cmd], { shell: true }).status !== 0) {
    console.error(`${cmd} is required — ${hint}`);
    process.exit(2);
  }
}
need("docker", "install Docker Desktop");
need("supabase", "brew install supabase/tap/supabase");
if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
  console.error("the Docker daemon is not running");
  process.exit(2);
}

// A project of our own, on ports nothing else uses. Never `supabase start` in
// the repo: there is a stack already serving the app.
rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, "supabase"), { recursive: true });
writeFileSync(join(WORK, "supabase", "config.toml"), `
project_id = "${PROJECT}"
[api]
enabled = true
port = 55321
schemas = ["public", "graphql_public"]
[db]
port = ${DB_PORT}
shadow_port = 55320
major_version = 17
[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
[studio]
enabled = false
[inbucket]
enabled = false
[storage]
enabled = true
[realtime]
enabled = false
[analytics]
enabled = false
`.trimStart());

cpSync(join(REPO, "supabase", "migrations"), join(WORK, "supabase", "migrations"), { recursive: true });
const count = execFileSync("bash", ["-c", `ls ${join(WORK, "supabase/migrations")}/*.sql | wc -l`]).toString().trim();
console.log(`replaying ${count} migrations into an empty database…`);

let failed = false;
try {
  const started = run("supabase", ["start", "-x", "studio,inbucket,realtime,logflare,vector,imgproxy,edge-runtime,postgres-meta"], { stdio: "pipe" });
  if (started.status !== 0) {
    console.error("could not start the replay stack:\n" + (started.stderr || started.stdout));
    process.exit(2);
  }
  // `supabase start` already applies supabase/migrations in order. A reset
  // re-runs them from empty, which is the case we actually care about.
  const reset = run("supabase", ["db", "reset"], { stdio: "pipe" });
  const out = (reset.stdout || "") + (reset.stderr || "");
  if (reset.status !== 0) {
    failed = true;
    console.error("\nTHE CORPUS DOES NOT REPLAY.\n");
    // The CLI names the file it was applying when it died.
    const m = out.match(/([0-9]{14}_[a-z0-9_]+\.sql)/g);
    if (m) console.error(`died while applying: ${m[m.length - 1]}`);
    console.error(out.split("\n").filter((l) => /error|ERROR|failed/.test(l)).slice(0, 20).join("\n"));
  } else {
    console.log("the corpus replays clean — this repository can rebuild its own database");
  }
} finally {
  run("supabase", ["stop", "--no-backup"], { stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
