#!/usr/bin/env node
/**
 * The gate battery, in order, stopping at the first failure.
 *
 *   npm run gates        the fast battery — typecheck, lint, design system,
 *                        unit tests, route-manifest coverage, advisories.
 *                        No server, no Docker, no network beyond `npm audit`.
 *   npm run gates:full   the fast battery, then build, migration replay
 *                        (Docker), and the two server-bound gates — the route
 *                        audit and the e2e persona suite. If BASE_URL is set
 *                        they run against it; otherwise a production server
 *                        is started from the build on GATES_PORT (3100) and
 *                        stopped afterwards. E2E_PASSWORD is required for the
 *                        suite, and its absence FAILS the gate rather than
 *                        skipping it — a green run without the personas
 *                        proves nothing, which is the rule CI already keeps.
 *
 * One line per gate. A gate's own output is held back and printed only when
 * it fails, so the summary reads as a summary; pass --verbose to stream it.
 *
 * Why a script and not `a && b && c` in package.json: the server-bound gates
 * need a server started and reliably stopped, the failing gate's output has
 * to be shown with its name on it, and "which gate failed" should be the first
 * line of the report rather than the last line of a scrollback.
 */
import { spawn, spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FULL = process.argv.includes("--full");
const VERBOSE = process.argv.includes("--verbose");
const PORT = Number(process.env.GATES_PORT || 3100);

const FAST = [
  ["typecheck", "npx", ["tsc", "--noEmit"]],
  ["lint", "npx", ["eslint", "src", "scripts", "--max-warnings=0"]],
  ["design system", "node", ["scripts/audit-design-system.mjs"]],
  ["unit tests", "npx", ["vitest", "run"]],
  ["route manifest", "node", ["scripts/audit-routes.mjs", "--manifest-only"]],
  ["letters", "node", ["scripts/audit-letters.mjs"]],
  ["advisories", "npm", ["audit", "--audit-level=high"]],
];

const SLOW = [
  ["build", "npm", ["run", "build"]],
  ["bundle budget", "node", ["scripts/audit-bundle.mjs"]],
  ["migration replay", "node", ["scripts/replay-migrations.mjs"]],
];

const SERVER_BOUND = [
  ["route audit", "node", ["scripts/audit-routes.mjs"]],
  ["e2e personas", "node", ["scripts/e2e-suite.mjs"]],
];

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function run([name, cmd, args], env = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env, FORCE_COLOR: "0" },
    encoding: "utf8",
    stdio: VERBOSE ? "inherit" : "pipe",
    maxBuffer: 64 * 1024 * 1024,
  });
  const ok = r.status === 0;
  console.log(`${ok ? "✓" : "✕"} ${pad(name, 18)} ${seconds(Date.now() - started)}`);
  if (!ok) {
    if (!VERBOSE) {
      const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
      if (out) console.error(`\n── ${name}: ${cmd} ${args.join(" ")} ──\n${out}\n`);
      if (r.error) console.error(String(r.error));
    }
    console.error(`stopped at "${name}" (exit ${r.status ?? "signal"})`);
    process.exit(1);
  }
}

/* A production server from the build, for the gates that fetch pages. Started
   here only when the caller has not pointed BASE_URL at one already. */
async function withServer(fn) {
  if (process.env.BASE_URL) return fn(process.env.BASE_URL);
  const base = `http://localhost:${PORT}`;
  const child = spawn("npm", ["run", "start", "--", "--port", String(PORT)], {
    cwd: root, stdio: VERBOSE ? "inherit" : "ignore", env: { ...process.env },
  });
  const stop = () => { if (!child.killed) child.kill("SIGTERM"); };
  process.on("exit", stop);
  process.on("SIGINT", () => { stop(); process.exit(130); });
  const started = Date.now();
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(base, { redirect: "manual" })).status < 500; } catch { /* not yet */ }
    if (!up) await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`${up ? "✓" : "✕"} ${pad("server", 18)} ${seconds(Date.now() - started)}  ${base}`);
  if (!up) { stop(); console.error("the built server did not answer within 60s"); process.exit(1); }
  try { return await fn(base); } finally { stop(); }
}

console.log(`gates${FULL ? " (full)" : ""} — ${root}\n`);
for (const g of FAST) run(g);
if (FULL) {
  for (const g of SLOW) run(g);
  await withServer(async (base) => {
    for (const g of SERVER_BOUND) run(g, { BASE_URL: base });
  });
}
console.log(`\nall ${FULL ? FAST.length + SLOW.length + SERVER_BOUND.length : FAST.length} gates green`);
