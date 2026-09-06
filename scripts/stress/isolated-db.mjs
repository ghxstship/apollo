/* An isolated database to stress, built the way scripts/replay-migrations.mjs
   builds one — same reason, said again: there is a Supabase stack already
   serving the app and a production project behind it, and neither is a place
   to fire forty simultaneous writes at a capacity check. So: own project id,
   own ports (a second set, so a replay and a stress run can coexist), the
   migration corpus replayed into an empty database, and nothing shared.

   Everything here is exported for scripts/stress/concurrency.mjs. Running this
   file directly just brings the stack up and leaves it up, which is handy while
   writing a new case: `node scripts/stress/isolated-db.mjs --up`. */
import { mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

export const PROJECT = "unstress";
export const CONTAINER = `supabase_db_${PROJECT}`;
const WORK = join(process.env.TMPDIR ?? "/tmp", "un-stress");
const REPO = process.env.UN_REPO ?? process.cwd();

function need(cmd, hint) {
  if (spawnSync("command", ["-v", cmd], { shell: true }).status !== 0) {
    console.error(`${cmd} is required — ${hint}`);
    process.exit(2);
  }
}

export function up({ quiet = false } = {}) {
  need("docker", "install Docker Desktop");
  need("supabase", "brew install supabase/tap/supabase");
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    console.error("the Docker daemon is not running");
    process.exit(2);
  }

  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(join(WORK, "supabase"), { recursive: true });
  writeFileSync(join(WORK, "supabase", "config.toml"), `
project_id = "${PROJECT}"
[api]
enabled = true
port = 55421
schemas = ["public", "graphql_public"]
[db]
port = 55422
shadow_port = 55420
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

  if (!quiet) console.log("replaying the migration corpus into an isolated database…");
  const started = spawnSync("supabase", ["start", "-x",
    "studio,inbucket,realtime,logflare,vector,imgproxy,edge-runtime,postgres-meta"],
    { cwd: WORK, encoding: "utf8" });
  if (started.status !== 0) {
    console.error("could not start the stress stack:\n" + (started.stderr || started.stdout));
    process.exit(2);
  }
  if (!quiet) console.log("database up.");
}

export function down() {
  spawnSync("supabase", ["stop", "--no-backup"], { cwd: WORK, stdio: "ignore" });
  rmSync(WORK, { recursive: true, force: true });
}

/* One-shot SQL as the superuser: seeding, and reading the invariant back. */
export function sql(text, { rows = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-X", "-q"];
  if (rows) args.push("-t", "-A", "-F", "|");
  const r = spawnSync("docker", args, { input: text, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`SQL failed:\n${text}\n---\n${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

export function scalar(text) {
  const out = sql(text, { rows: true });
  return out.split("\n")[0] ?? "";
}

/* A session that will contend. It connects, waits for the wall-clock barrier,
   and only then opens its transaction — so the processes are started long
   before any of them touches a row, and they arrive together rather than in
   the order Node happened to spawn them. */
export function contender({ at, body, as = null, label = "" }) {
  const claims = as ? JSON.stringify({ sub: as, role: "authenticated" }) : null;
  const script = [
    `select pg_sleep(greatest(0, extract(epoch from (timestamptz '${at}' - clock_timestamp()))));`,
    `begin;`,
    as ? `set local role authenticated;` : `set local role postgres;`,
    as ? `select set_config('request.jwt.claims', ${quote(claims)}, true);` : ``,
    body.trim().endsWith(";") ? body : body + ";",
    `commit;`,
  ].filter(Boolean).join("\n");

  return new Promise((resolve) => {
    const p = spawn("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres",
      "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"],
      { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({
      label, ok: code === 0, out: out.trim(), err: err.trim(),
      state: (err.match(/SQLSTATE\s+([0-9A-Z]{5})/) || [])[1] ?? null,
      message: (err.match(/ERROR:\s+(.*)/) || [])[1] ?? null,
    }));
    p.stdin.end(script);
  });
}

export const quote = (s) => "'" + String(s).replaceAll("'", "''") + "'";

/* A barrier a few hundred ms out: long enough for every `docker exec` to have
   connected, short enough that a run of twenty cases is not a coffee break.
   Read off the DATABASE clock, so the host's clock never enters into it. */
export function barrier(ms = 1500) {
  return scalar(`select (clock_timestamp() + interval '${ms} milliseconds')::text`);
}

if (process.argv.includes("--up")) up();
if (process.argv.includes("--down")) down();
