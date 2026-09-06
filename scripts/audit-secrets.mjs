#!/usr/bin/env node
/* Nothing in this repository looked for a committed secret.
 *
 * Eleven gates ran before this one and every one was about correctness, shape
 * or accessibility. None would have noticed a live key pasted into a migration
 * — and today's hardening moved a real one out of cron.job.command, which is
 * the near miss that says the class is reachable here rather than theoretical.
 *
 * PRECISION OVER RECALL, deliberately. A scanner that flags every long hex
 * string finds every SHA-256 in a test and earns an exemption list within a
 * week — and an exemption list is where the real finding goes to hide. So this
 * looks only for things that are credentials BY THEIR SHAPE: a vendor's own
 * prefix, a signed token, a private-key header. Plus the two file-level
 * mistakes that actually happen — an environment file committed, and a secret
 * assigned to a name that says what it is.
 *
 * It does not measure entropy. Entropy is how a scanner finds a key nobody has
 * seen before, and also how it finds a UUID; this repository is full of UUIDs.
 *
 * Scans TRACKED files only. An untracked .env.local is the correct place for a
 * secret, and flagging it would teach people to ignore this.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOT = process.cwd();

/* Shapes that are only ever a credential. */
const SHAPES = [
  [/\bsk_(live|test)_[A-Za-z0-9]{20,}/g, "a Stripe secret key"],
  [/\brk_(live|test)_[A-Za-z0-9]{20,}/g, "a Stripe restricted key"],
  [/\bwhsec_[A-Za-z0-9]{20,}/g, "a Stripe webhook signing secret"],
  [/\bre_[A-Za-z0-9]{24,}/g, "a Resend API key"],
  [/\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "a SendGrid key"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "an AWS access key id"],
  [/\bghp_[A-Za-z0-9]{30,}/g, "a GitHub token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/g, "a Slack token"],
  [/-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, "a private key"],
];

/* A JWT is not automatically a secret, and treating it as one would be the
   first step toward an exemption list.
 *
 * Supabase issues two: the anon key, which ships to every browser and is
 * public by construction, and the service-role key, which bypasses every
 * policy in the database. They are the same shape. Two anon keys sit in
 * migrations from July and August, put there to schedule the drain jobs, and
 * flagging those would have taught the next reader that this gate cries wolf —
 * at which point a committed service-role key goes past unread.
 *
 * So the token is opened and its role is read. Anon passes; anything else, or
 * anything that will not decode, fails. That is a judgement about the shape of
 * the thing rather than about which file it happens to be in, which is the
 * only kind of exception this file should have. */
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload + "=".repeat((4 - (payload.length % 4)) % 4), "base64").toString("utf8");
    const role = JSON.parse(json).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/* A credential assigned to a name that says what it is. The value has to be a
   literal of real length — a reference to process.env is exactly what this
   file wants people to write instead. */
/* `_KEY` alone was too broad and caught three storage-key constants —
   DISMISS_KEY, GANGWAY_QUEUE_KEY — which are names of things in localStorage
   and not credentials at all. Renaming product code to satisfy a scanner is
   backwards, so the pattern narrowed instead: only the compounds that mean a
   credential in every codebase that uses them. */
const NAMED =
  /\b([A-Za-z_][A-Za-z0-9_]*(?:SECRET|PASSWORD|PRIVATE_KEY|API_KEY|APIKEY|ACCESS_KEY|SERVICE_KEY|SERVICE_ROLE|ACCESS_TOKEN|AUTH_TOKEN))\b\s*[:=]\s*["'`]([^"'`\n]{16,})["'`]/g;

/* Names whose value is public by design, and obvious placeholders. */
const PUBLIC_NAMES = /ANON_KEY|PUBLISHABLE|PUBLIC_KEY|VAPID_PUBLIC/i;
const PLACEHOLDER = /^(x{4,}|<[^>]+>|\.{3}|your[-_ ]|changeme|example|placeholder|test[-_]|dummy|fake)/i;
const REFERENCE = /process\.env|Deno\.env|current_setting|get_app_secret|vault\./;

const SKIP_FILES =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|pdf|mp4|zip)$/i;

let tracked;
try {
  tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  console.error("not a git checkout — nothing to scan");
  process.exit(0);
}

const hits = [];
let scanned = 0;

for (const rel of tracked) {
  if (SKIP_FILES.test(rel)) continue;
  /* An environment file has no business being tracked, whatever is in it. */
  if (/(^|\/)\.env($|\.)/.test(rel) && !/\.(example|sample|template)$/.test(rel)) {
    hits.push({ file: rel, line: 1, what: "an environment file is committed", detail: rel });
    continue;
  }
  let src;
  try {
    src = readFileSync(`${ROOT}/${rel}`, "utf8");
  } catch {
    continue;
  }
  if (src.indexOf(String.fromCharCode(0)) !== -1) continue; /* binary */
  scanned += 1;
  const lineOf = (i) => src.slice(0, i).split("\n").length;

  for (const [re, what] of SHAPES) {
    for (const m of src.matchAll(re)) {
      if (PLACEHOLDER.test(m[0])) continue;
      hits.push({ file: rel, line: lineOf(m.index), what, detail: `${m[0].slice(0, 12)}...` });
    }
  }
  for (const m of src.matchAll(JWT)) {
    const role = jwtRole(m[0]);
    if (role === "anon") continue;
    hits.push({
      file: rel,
      line: lineOf(m.index),
      what: role ? `a signed token for role '${role}'` : "a signed token that will not decode",
      detail: `${m[0].slice(0, 12)}...`,
    });
  }
  for (const m of src.matchAll(NAMED)) {
    if (PUBLIC_NAMES.test(m[1])) continue;
    if (PLACEHOLDER.test(m[2])) continue;
    if (REFERENCE.test(m[2])) continue;
    /* A credential is a single token. NO_SERVICE_KEY holds an English sentence
       explaining that a deployment has no service key, and matched the
       SERVICE_KEY compound — so the discriminator is whitespace rather than an
       exemption for that one constant.

       The trade this makes, stated rather than hidden: a passphrase containing
       spaces, assigned to a name saying it is a password, would pass. That is
       a narrower miss than the noise of flagging every sentence that happens
       to be stored under a name ending in KEY, and noise is what gets a gate
       switched off. */
    if (/\s/.test(m[2])) continue;
    hits.push({ file: rel, line: lineOf(m.index), what: `${m[1]} carries a literal`, detail: `${m[2].slice(0, 8)}...` });
  }
}

console.log(`secrets - ${scanned} tracked text files scanned`);
if (!hits.length) {
  console.log("\nnothing that is a credential by its shape");
  process.exit(0);
}
console.log("");
for (const h of hits) console.log(`FAIL  ${h.file}:${h.line} - ${h.what}  (${h.detail})`);
console.log(
  `\n${hits.length} finding(s).\n` +
    "If one is genuinely not a secret, change its shape rather than adding an exemption -\n" +
    "an exemption list is where the real finding goes to hide. If one IS a secret: rotate it\n" +
    "first, then remove it, and remember the history still has it.",
);
process.exit(1);
