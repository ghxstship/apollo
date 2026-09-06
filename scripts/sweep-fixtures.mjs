#!/usr/bin/env node
/**
 * Clear the fixture and demonstration members from a database, and say what
 * is left.
 *
 * The club was built on the database it is about to launch on, so the roll
 * holds the people who built it: five e2e personas, five demonstration
 * members, a skipper and a viewport account, and the passes, orders and
 * ledger lines a season of suite runs left behind them. Whether to launch on
 * this database or a fresh one is the owner's decision. This script exists so
 * that the first option is available, and so that the owner can see exactly
 * what it costs before choosing it.
 *
 * WHAT IT WILL NOT DO
 *   - It will not delete a member. A member is anonymised, never deleted —
 *     profiles carries a BEFORE DELETE trigger that refuses every delete, and
 *     eleven money and record keys now RESTRICT, so a pass, a charge and a
 *     signature all keep the name they were made against. The fixture members'
 *     rows are cleared and the members themselves are then written down to the
 *     same columns erase_departed_profiles() writes: a departed member with no
 *     name, no handle, no address. The row stays.
 *   - It will not delete a signature or a counter-signature. Those are matters
 *     of record and the database refuses; the script does not try, and says
 *     how many are staying and why.
 *   - It will not touch a member who is not a fixture, and it will not run at
 *     all against a database that does not look like a fixture-bearing one.
 *
 * ORDER, AND WHY IT IS THIS ORDER
 *   Passes go before the ledgers, because releasing a pass writes credit lines
 *   into account_ledger and knots_ledger and a ledger swept first would fill
 *   back up. Guests are read before their pass goes, because pass_guests.rsvp_id
 *   is SET NULL by design and a guest outlives the booking. The member is
 *   written down after their content, so the departure finds no future pass to
 *   credit; the address is nulled in the same statement, so no farewell letter
 *   is queued to an account that was never a person.
 *
 * USAGE
 *   node scripts/sweep-fixtures.mjs                  # dry run — prints the plan
 *   node scripts/sweep-fixtures.mjs --yes            # the only way it deletes
 *   node scripts/sweep-fixtures.mjs --keep-personas  # leave the e2e-* five
 *   node scripts/sweep-fixtures.mjs --max-real=25    # loosen the live-club guard
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service
 * role is required rather than the staff badge because the ledgers and the
 * outboxes carry no DELETE policy for anyone — that is deliberate, and the
 * only honest way past it for a one-off sweep is to say so out loud.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
try {
  for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* the environment provides it */ }

const SUPA = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const argv = process.argv.slice(2);
const COMMIT = argv.includes("--yes");
const KEEP_PERSONAS = argv.includes("--keep-personas");
const MAX_REAL = Number((argv.find((a) => a.startsWith("--max-real=")) || "").split("=")[1] || 25);

if (!SUPA) { console.error("NEXT_PUBLIC_SUPABASE_URL is not set — there is no database to look at."); process.exit(2); }
if (!KEY) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set. The ledgers and the outboxes carry no DELETE policy for");
  console.error("staff, by design, so a badge cannot do this. Supply the service role or do not run the sweep.");
  process.exit(2);
}

/* A fixture address is e2e-…@fixtures.invalid, skipper@fixtures.invalid,
   viewport-audit@fixtures.invalid or …@demo.fixtures.invalid. Anchored on the
   domain, so a real member whose address merely contains the word cannot be
   caught by it. */
const FIXTURE = /@(demo\.)?fixtures\.invalid$/i;
const PERSONA = /^e2e-[a-z]+@fixtures\.invalid$/i;

/* ── PostgREST ─────────────────────────────────────────────────────────── */
async function call(method, path, { body = null, prefer = "" } = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data, range: res.headers.get("content-range") };
}

const total = (range) => Number((range || "").split("/")[1] ?? NaN);

/** How many rows match, without fetching them. */
async function count(path) {
  const res = await call("GET", path.includes("?") ? `${path}&limit=1` : `${path}?limit=1`,
    { prefer: "count=exact" });
  if (!res.ok) throw new Error(`counting ${path}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  return total(res.range);
}

async function rows(path) {
  const res = await call("GET", path);
  if (!res.ok) throw new Error(`reading ${path}: ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  return res.data || [];
}

/** Delete, in one statement where the database will take it and one member at
    a time where it will not — a table with twelve thousand rows behind it is
    the one most likely to run out of time in a single sweep. */
async function remove(table, column, ids) {
  const inList = `(${ids.join(",")})`;
  const one = await call("DELETE", `${table}?${column}=in.${inList}`,
    { prefer: "return=minimal,count=exact" });
  if (one.ok) return { gone: total(one.range) || 0, refused: null };
  let gone = 0;
  for (const id of ids) {
    const r = await call("DELETE", `${table}?${column}=eq.${id}`,
      { prefer: "return=minimal,count=exact" });
    if (!r.ok) return { gone, refused: `${r.status} ${String(JSON.stringify(r.data)).slice(0, 180)}` };
    gone += total(r.range) || 0;
  }
  return { gone, refused: null };
}

/* ── The plan ──────────────────────────────────────────────────────────────
   Every table that keys to a member, in the order it has to be cleared, read
   off the foreign-key graph on 2026-09-06. A table added later that references
   profiles will not be swept until it is added here — the sweep would rather
   leave a row behind than delete one nobody listed. */
const PLAN = [
  { phase: "passes", table: "passes", column: "profile_id",
    why: "the pass itself; its transfers, add-ons, daybeds and pod sessions cascade with it" },

  { phase: "money", table: "galley_orders", column: "profile_id", why: "galley tickets, with their lines" },
  { phase: "money", table: "shop_orders", column: "profile_id", why: "shop orders, with their lines" },
  { phase: "money", table: "invoices", column: "profile_id", why: "invoices" },
  { phase: "money", table: "subscriptions", column: "profile_id", why: "dues subscriptions, with their dunning" },
  { phase: "money", table: "installment_plans", column: "profile_id", why: "instalment plans" },
  { phase: "money", table: "payment_methods", column: "profile_id", why: "cards on file, with their notices" },
  { phase: "money", table: "pass_credits", column: "profile_id", why: "pass credits carried by the plan" },

  { phase: "ledgers", table: "account_ledger", column: "profile_id",
    why: "money — swept after the passes, whose release writes credit lines into it" },
  { phase: "ledgers", table: "knots_ledger", column: "profile_id",
    why: "knots — same reason, same order" },

  { phase: "content", table: "notifications", column: "profile_id", why: "the member's word list" },
  { phase: "content", table: "open_deck_hails", column: "profile_id", why: "hails" },
  { phase: "content", table: "open_deck_comments", column: "author_id", why: "comments" },
  { phase: "content", table: "open_deck_flags", column: "flagger_id", why: "flags raised" },
  { phase: "content", table: "open_deck_posts", column: "author_id", why: "posts" },
  { phase: "content", table: "messages", column: "author_id", why: "messages sent" },
  { phase: "content", table: "thread_members", column: "profile_id", why: "seats in threads" },
  { phase: "content", table: "direct_thread_pairs", column: "hi", why: "direct pairings" },
  { phase: "content", table: "direct_thread_pairs", column: "lo", why: "direct pairings, the other side" },
  { phase: "content", table: "member_blocks", column: "blocker_id", why: "blocks placed" },
  { phase: "content", table: "member_blocks", column: "blocked_id", why: "blocks received" },
  { phase: "content", table: "matches", column: "profile_a", why: "matches" },
  { phase: "content", table: "matches", column: "profile_b", why: "matches, the other side" },
  { phase: "content", table: "table_picks", column: "picker", why: "table picks made" },
  { phase: "content", table: "table_picks", column: "picked", why: "table picks received" },
  { phase: "content", table: "table_seats", column: "profile_id", why: "chairs at a table" },
  { phase: "content", table: "debriefs", column: "profile_id", why: "debriefs" },
  { phase: "content", table: "poll_votes", column: "profile_id", why: "votes" },
  { phase: "content", table: "contest_entries", column: "profile_id", why: "contest entries" },
  { phase: "content", table: "contest_results", column: "profile_id", why: "contest results" },
  { phase: "content", table: "reward_redemptions", column: "profile_id", why: "rewards taken" },
  { phase: "content", table: "member_marks", column: "profile_id", why: "marks" },
  { phase: "content", table: "producer_turns", column: "profile_id", why: "producer turns" },
  { phase: "content", table: "member_event_proposals", column: "proposer_id", why: "proposals" },
  { phase: "content", table: "charter_options", column: "profile_id", why: "charter options" },
  { phase: "content", table: "charter_requests", column: "profile_id", why: "charter requests" },
  { phase: "content", table: "crew_requests", column: "profile_id", why: "crew requests" },
  { phase: "content", table: "waitlist_entries", column: "profile_id", why: "places on a waitlist" },
  { phase: "content", table: "membership_pauses", column: "profile_id", why: "pauses taken" },
  { phase: "content", table: "member_number_releases", column: "profile_id", why: "released member numbers" },
  { phase: "content", table: "invites", column: "inviter_id", why: "invites written" },
  { phase: "content", table: "door_grants", column: "profile_id", why: "door grants held" },
  { phase: "content", table: "vetting_files", column: "profile_id", why: "the vetting file" },
  { phase: "content", table: "preference_sheets", column: "profile_id", why: "the preference sheet" },
  { phase: "content", table: "preference_boundaries", column: "profile_id", why: "boundaries" },
  { phase: "content", table: "member_qr_tokens", column: "profile_id", why: "member card codes" },
  { phase: "content", table: "wallet_tokens", column: "profile_id", why: "wallet passes, with their registrations" },
  { phase: "content", table: "push_subscriptions", column: "profile_id", why: "push registrations" },
  { phase: "content", table: "push_outbox", column: "profile_id", why: "queued pushes" },
  { phase: "content", table: "automation_queue", column: "profile_id", why: "queued automations" },
  { phase: "content", table: "episode_daybeds", column: "profile_id", why: "daybeds claimed" },
];

/* Rows the database will not let go of, and the sentence for each. The sweep
   does not attempt these: a refusal forced into a retry loop is noise, and
   the answer is not going to change. */
const STAYING = [
  { table: "signatures", column: "profile_id",
    because: "a signature is a matter of record; the database takes a delete only from a redaction, and evidence of who signed what should outlive the fixture that signed it" },
  { table: "counter_signatures", column: "signed_by",
    because: "a counter-signature is a matter of record and cannot be deleted at all" },
];

/* ── The guard ─────────────────────────────────────────────────────────────
   The whole risk of this script is that somebody runs it against the wrong
   database. So it looks at the roll first and refuses unless the roll is
   plainly a fixture-bearing one. */
function theRollLooksLikeFixtures(fixtures, real) {
  if (fixtures.length === 0) {
    return "no member on this roll carries a fixture address. Either this is not the database you meant, " +
      "or the fixtures are already gone; either way there is nothing here to sweep.";
  }
  if (real.length > MAX_REAL) {
    return `${real.length} members on this roll are real people and only ${fixtures.length} are fixtures. ` +
      `That is a club, not a workbench. If ${real.length} is genuinely right, say so with --max-real=${real.length}.`;
  }
  if (fixtures.length < real.length) {
    return `${real.length} of the ${fixtures.length + real.length} members here are real and only ${fixtures.length} ` +
      "are fixtures. A fixture-bearing database is mostly fixtures; this one is not, so the sweep stops.";
  }
  return null;
}

/* ── Report ────────────────────────────────────────────────────────────── */
const n = (x) => String(x).padStart(7);
const rule = (s) => console.log(`\n${s}\n${"─".repeat(s.length)}`);

async function main() {
  console.log(`\nFixture sweep — ${SUPA}`);
  console.log(COMMIT
    ? "  --yes was given: this run WILL delete."
    : "  Dry run. Nothing is deleted. Add --yes when the plan below is the plan you want.");

  const roll = await rows("profiles?select=id,email,full_name,status&order=email");
  const fixtures = roll.filter((p) => FIXTURE.test(p.email || ""));
  const real = roll.filter((p) => !FIXTURE.test(p.email || ""));
  const swept = fixtures.filter((p) => !(KEEP_PERSONAS && PERSONA.test(p.email || "")));
  const spared = fixtures.filter((p) => KEEP_PERSONAS && PERSONA.test(p.email || ""));

  const refusal = theRollLooksLikeFixtures(fixtures, real);
  if (refusal) {
    console.error(`\nThe sweep will not run here.\n  ${refusal}\n`);
    process.exit(2);
  }
  if (swept.length === 0) {
    console.log("\nEvery fixture on this roll is being kept. Nothing to do.\n");
    return;
  }

  const ids = swept.map((p) => p.id);

  rule(`The ${swept.length} members whose rows would go`);
  for (const p of swept) console.log(`  ${(p.email || "—").padEnd(34)} ${p.full_name || "—"}`);
  if (spared.length) {
    console.log(`\n  Kept (--keep-personas), because the nightly harnesses sign in as them:`);
    for (const p of spared) console.log(`  ${(p.email || "—").padEnd(34)} ${p.full_name || "—"}`);
  }

  /* Guests are read before their pass goes: pass_guests.rsvp_id is SET NULL by
     design, so once the pass is deleted there is nothing left tying the guest
     to the member who brought them. A guest who signed a waiver stays — the
     signature RESTRICTs the guest row, which is the same rule as the members'. */
  const fixturePasses = await rows(`passes?profile_id=in.(${ids.join(",")})&select=id`);
  const passIds = fixturePasses.map((r) => r.id);
  let guestIds = [], signedGuests = [];
  if (passIds.length) {
    const guests = await rows(`pass_guests?rsvp_id=in.(${passIds.join(",")})&select=id`);
    guestIds = guests.map((g) => g.id);
    if (guestIds.length) {
      const sigs = await rows(`signatures?guest_id=in.(${guestIds.join(",")})&select=guest_id`);
      signedGuests = [...new Set(sigs.map((s) => s.guest_id))];
      guestIds = guestIds.filter((g) => !signedGuests.includes(g));
    }
  }

  rule("What would go, and what would remain");
  console.log(`  ${"table".padEnd(28)} ${"goes".padStart(7)} ${"remains".padStart(9)}   why`);
  const plan = [];
  for (const step of PLAN) {
    const goes = await count(`${step.table}?${step.column}=in.(${ids.join(",")})`);
    const whole = await count(step.table);
    plan.push({ ...step, goes, remains: whole - goes });
    if (goes > 0) console.log(`  ${step.table.padEnd(28)} ${n(goes)} ${n(whole - goes).padStart(9)}   ${step.why}`);
  }
  const quiet = plan.filter((s) => s.goes === 0).length;
  if (quiet) console.log(`  (${quiet} further tables hold nothing for these members)`);

  if (guestIds.length || signedGuests.length) {
    const wholeGuests = await count("pass_guests");
    console.log(`  ${"pass_guests".padEnd(28)} ${n(guestIds.length)} ${n(wholeGuests - guestIds.length).padStart(9)}   guests brought on a fixture pass`);
  }

  rule("What cannot go, and why");
  console.log(`  ${swept.length} members. A member is anonymised, never deleted. Each would be set to`);
  console.log(`  departed and written down to the same columns erase_departed_profiles() writes:`);
  console.log(`  no name, no handle, no address, nothing in the directory. The row stays, so every`);
  console.log(`  charge and every signature it is named on stays attributable.`);
  const personas = swept.filter((p) => PERSONA.test(p.email || ""));
  if (personas.length) {
    console.log(`\n  ${personas.length} of them are the e2e personas the nightly run signs in as. Their sign-in`);
    console.log(`  survives — the address in the auth schema is not reachable from here — but their`);
    console.log(`  membership will read departed, and the suite and the adversarial harness will fail`);
    console.log(`  from the first page they open. Keep them with --keep-personas if the nightly`);
    console.log(`  should go on running against this database.`);
  }
  for (const s of STAYING) {
    const stuck = await count(`${s.table}?${s.column}=in.(${ids.join(",")})`);
    if (stuck > 0) console.log(`\n  ${stuck} ${s.table.replace(/_/g, " ")} — ${s.because}.`);
  }
  if (signedGuests.length) {
    console.log(`\n  ${signedGuests.length} pass guests — each signed a waiver, and a signature holds its guest row in place.`);
  }

  if (!COMMIT) {
    const goes = plan.reduce((a, s) => a + s.goes, 0) + guestIds.length;
    rule("Nothing was deleted");
    console.log(`  ${goes} rows would go and ${swept.length} members would be written down.`);
    console.log(`  The roll would keep ${real.length} real members${spared.length ? ` and ${spared.length} kept personas` : ""}.`);
    console.log(`  The "goes" column runs a little short of what the real run will report: releasing a`);
    console.log(`  pass writes credit lines into the two ledgers, and the same run sweeps those too.`);
    console.log(`  The "remains" column is the one to read, and it is not affected.`);
    console.log(`  Run it again with --yes when that is the number you want.\n`);
    return;
  }

  /* ── The sweep itself ──────────────────────────────────────────────── */
  rule("Sweeping");
  const refused = [];
  let gone = 0;
  for (const step of plan) {
    if (step.goes === 0) continue;
    const r = await remove(step.table, step.column, ids);
    gone += r.gone;
    if (r.refused) {
      refused.push(`${step.table}.${step.column}: ${r.refused}`);
      console.log(`  ✕ ${step.table.padEnd(28)} refused — ${r.refused}`);
    } else {
      console.log(`  · ${step.table.padEnd(28)} ${n(r.gone)} gone`);
    }
  }
  if (guestIds.length) {
    const r = await remove("pass_guests", "id", guestIds);
    gone += r.gone;
    if (r.refused) refused.push(`pass_guests.id: ${r.refused}`);
    console.log(`  · ${"pass_guests".padEnd(28)} ${n(r.gone)} gone`);
  }

  /* The member, last, and written down rather than removed. Status and the
     identifying columns move in one statement: the departure trigger reads the
     new address, and a null address queues no farewell letter to an account
     that was never a person. */
  rule("Writing the members down");
  let anonymised = 0;
  for (const p of swept) {
    const res = await call("PATCH", `profiles?id=eq.${p.id}`, {
      prefer: "return=minimal",
      body: {
        status: "departed",
        full_name: "Departed member",
        handle: null,
        email: null,
        phone: null,
        phone_verified: false,
        bio: null,
        interests: [],
        stripe_customer_id: null,
        in_directory: false,
        on_manifest: false,
        calendar_token: randomUUID(),
        notification_prefs: {},
      },
    });
    if (res.ok) { anonymised += 1; console.log(`  · ${p.email} → departed, anonymised`); }
    else { refused.push(`profiles ${p.email}: ${res.status} ${String(JSON.stringify(res.data)).slice(0, 180)}`); console.log(`  ✕ ${p.email} — ${res.status}`); }
  }

  rule("What remains");
  for (const step of PLAN) {
    const left = await count(step.table);
    const still = await count(`${step.table}?${step.column}=in.(${ids.join(",")})`);
    if (left > 0 || still > 0) {
      console.log(`  ${step.table.padEnd(28)} ${n(left)}${still ? `   (${still} still keyed to a swept member)` : ""}`);
    }
  }
  console.log(`\n  members ${n(roll.length)}  — ${real.length} real, ${anonymised} anonymised${spared.length ? `, ${spared.length} kept` : ""}`);
  console.log(`  rows deleted ${gone}`);

  if (refused.length) {
    rule("Refused");
    for (const r of refused) console.log(`  ${r}`);
    console.log("");
    process.exit(1);
  }
  console.log("");
}

main().catch((e) => { console.error(`\nthe sweep stopped: ${e.message}\n`); process.exit(1); });
