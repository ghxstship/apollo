/* Run ONE e2e module against a live server and database, for the person
   writing it. Usage:
     BASE_URL=http://localhost:3111 E2E_PASSWORD=… node scripts/e2e/_run.mjs money-and-booking
   Reads NEXT_PUBLIC_SUPABASE_URL from the environment like the suite does
   (source .env.local first). Signs in the five personas, runs the module's
   run(p, ctx), prints failures, exits 1 if any. Nothing else in the suite
   runs, so the footprint check and the sweep do not — clean up what you make. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rest, note, uid, login, homeWater, STALE_BEFORE, BASE, SUPA, RUN_TOKEN, results, failures, committeeAnswers } from "../e2e-suite.mjs";

const name = process.argv[2];
if (!name) { console.error("which module? e.g. node scripts/e2e/_run.mjs money-and-booking"); process.exit(2); }
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), name.endsWith(".mjs") ? name : `${name}.mjs`);
const mod = await import(file);

const personas = {};
for (const [who, email] of [
  ["regional", "e2e-regional@fixtures.invalid"],
  ["national", "e2e-national@fixtures.invalid"],
  ["global", "e2e-global@fixtures.invalid"],
  ["paused", "e2e-paused@fixtures.invalid"],
  ["staff", "e2e-staff@fixtures.invalid"],
]) personas[who] = await login(email);

await mod.run(personas, { BASE, SUPA, rest, note, uid, RUN_TOKEN, STALE_BEFORE, homeWater, login, committeeAnswers });
console.log(`${results.length - failures.length}/${results.length} checks passed in ${name}`);
process.exit(failures.length ? 1 : 0);
