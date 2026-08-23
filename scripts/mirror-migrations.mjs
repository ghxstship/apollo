/* Mirror remote migrations to disk from the ledger itself, so the local file
   name and body are exactly what was applied. Guessing the timestamp by hand
   is what produced version drift three times in this session. */
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const since = process.argv[2];
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

for (const r of rows) {
  const file = join(dir, `${r.version}_${r.name}.sql`);
  if (existsSync(file)) { console.log("exists", `${r.version}_${r.name}.sql`); continue; }
  writeFileSync(file, r.statements.join(";\n\n") + ";\n");
  console.log("wrote ", `${r.version}_${r.name}.sql`);
}
