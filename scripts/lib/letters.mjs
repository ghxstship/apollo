/* The letter gate. The registry of letters (public.email_templates, by
   migration), the sender that renders them (supabase/functions/send-outbox),
   and the callers that queue them (trigger bodies in migrations, and
   queue_email calls in src) are three sources of truth, and this holds them
   in agreement:

     1. every code the registry lists renders, and every code rendered is
        listed — run_automations refuses a letter the registry does not list,
        which is only worth anything if the registry lists what renders;
     2. every key a letter reads is a key something writes — `season-card`
        read p["charters"] for weeks while every payload carried `sailings`,
        and fourteen members were told they had made 0 of everything;
     3. every caller that queues a code by name supplies the keys that letter
        REQUIRES — an automation once named boarding-pass with {name, episode}
        and a member got a pass with no code on it;
     4. every letter is classified transactional or marketing, so the footer
        and the List-Unsubscribe header are decisions and not guesses;
     5. the letters that have no sender are exactly the ones we know about —
        card-expiring and final-notice are written and registered and nothing
        fires them, which is a fact this gate keeps visible rather than one
        that rots into a surprise;
     6. the copy is on-lexicon: no retired term, no exclamation mark, no emoji,
        and nothing that names a camera — the route audit reads served pages,
        and a letter is not a page, so nothing else looks at this text;
     7. no letter body ends on a variable;
     8. the letters the Bridge's rule picker keeps off the list are exactly
        those whose REQUIRES a rule's payload cannot fill, and the keys that
        picker assumes are the keys the live run_automations body writes.

   ON READING THE REGISTRY. An earlier version lifted codes out of migrations
   with `insert into public\.email_templates[\s\S]*?;`, and two migrations in
   one evening fell into the two traps that pattern sets: a semicolon inside a
   description ended the block early and hid two letters, and a comment that
   quoted the pattern matched itself and hid them again. The SQL is reduced to
   code first — comments gone — and then scanned with a reader that knows
   where a string literal begins and ends, so punctuation in prose is prose. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sqlCode } from "./sql-code.mjs";

/* Keys a letter reads that nothing writes YET, each with the writer that
   will. A ratchet: an entry here must still be unwritten, and the gate fails
   the moment a writer lands so the entry is removed rather than left to rot
   into a permanent exemption. Empty at the moment: holds_on and expires sat
   here for an afternoon until run_dunning (20260904114915) began writing
   them, which is exactly the afternoon this list exists for. */
const AWAITING_A_WRITER = {};

/* Letters with no caller that names them as a literal, each with the reason.
   Same ratchet: a letter listed here that gains a literal caller must come
   off the list, and a renderable letter that is NOT listed and has no caller
   is a letter nobody sends, which is a failure.

   dues-failed and final-notice ARE sent — by run_dunning (20260904114915),
   which reads the code out of public.dunning_steps and queues `st.template`.
   The code is data there, not a literal, so this gate cannot see it; the
   ladder's own foreign key to email_templates is what keeps that honest.
   card-expiring sat here too until the same migration named it outright. */
const LETTERS_WITHOUT_A_LITERAL_SENDER = ["dues-failed", "final-notice"];

/* Words a letter may never carry, over and above BANNED_TERMS. Word-bounded,
   because the brand list matches bare substrings and "event" hides inside
   "eventually". Cameras, filming and footage are the show's one secret. */
const LETTER_BANS = [
  /\bcameras?\b/i,
  /\bfilm(?:s|ed|ing)?\b/i,
  /\bfootage\b/i,
  /\bevents?\b/i,
  /\bvoyages?\b/i,
  /\bberths?\b/i,
  /\bharbou?rs?\b/i,
  /\bsalons?\b/i,
  /\bfathoms?\b/i,
  /\btickets?\b/i,
  /\bsea days?\b/i,
  /\bport days?\b/i,
  /\bcasting now\b/i,
];

// ---------- readers ----------

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/* From `from` to the statement's own terminator: the first `;` that is not
   inside a single-quoted string. Dollar-quoting does not occur inside an
   insert into the registry, so it is not handled here. */
function statementAt(sql, from) {
  let i = from;
  let quoted = false;
  while (i < sql.length) {
    const c = sql[i];
    if (quoted) {
      if (c === "'" && sql[i + 1] === "'") { i += 2; continue; }
      if (c === "'") quoted = false;
    } else if (c === "'") {
      quoted = true;
    } else if (c === ";") {
      return sql.slice(from, i);
    }
    i++;
  }
  return sql.slice(from);
}

/* The parenthesised groups of a VALUES list, each split into literals on the
   commas that sit outside quotes. */
function tuples(valuesSql) {
  const out = [];
  let i = 0;
  while (i < valuesSql.length) {
    if (valuesSql[i] !== "(") { i++; continue; }
    let j = i + 1;
    let quoted = false;
    const fields = [];
    let cur = "";
    while (j < valuesSql.length) {
      const c = valuesSql[j];
      if (quoted) {
        if (c === "'" && valuesSql[j + 1] === "'") { cur += "'"; j += 2; continue; }
        if (c === "'") { quoted = false; j++; continue; }
        cur += c; j++; continue;
      }
      if (c === "'") { quoted = true; j++; continue; }
      if (c === ",") { fields.push(cur.trim()); cur = ""; j++; continue; }
      if (c === ")") { fields.push(cur.trim()); break; }
      cur += c; j++;
    }
    out.push(fields);
    i = j + 1;
  }
  return out;
}

/* The registry as the migrations build it, in order: inserts (with their
   column list, in whatever order the file wrote it) and any later update
   that switches a code off. */
export function readRegistry(root) {
  const registered = new Map(); // code -> { active, description, file }
  const dir = join(root, "supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = sqlCode(readFileSync(join(dir, f), "utf8"));
    const re = /insert\s+into\s+public\.email_templates\s*\(([^)]*)\)\s*values/gi;
    let m;
    while ((m = re.exec(sql))) {
      const columns = m[1].split(",").map((c) => c.trim().toLowerCase());
      const stmt = statementAt(sql, m.index + m[0].length);
      const body = stmt.split(/\bon\s+conflict\b/i)[0];
      for (const fields of tuples(body)) {
        const row = {};
        columns.forEach((col, i) => { row[col] = fields[i]; });
        if (!row.code) continue;
        registered.set(row.code, {
          active: !/^false$/i.test(row.active ?? "true"),
          description: row.description ?? "",
          file: f,
        });
      }
    }
    const off = /update\s+public\.email_templates\s+set\s+active\s*=\s*false\s+where\s+code\s*(?:=\s*'([a-z0-9-]+)'|in\s*\(([^)]*)\))/gi;
    while ((m = off.exec(sql))) {
      const codes = m[1] ? [m[1]] : [...(m[2] ?? "").matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]);
      for (const code of codes) {
        const row = registered.get(code);
        if (row) row.active = false;
      }
    }
  }
  return registered;
}

/* Balanced-paren scan of jsonb_build_object(...) bodies. A non-greedy paren
   stops at the first `)` — `to_jsonb(c.marks_won)` truncated the argument list
   once and three written keys were reported as unwritten. */
function jsonbObjects(src) {
  const out = [];
  const re = /jsonb_build_object\s*\(/g;
  while (re.exec(src)) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}

function keysOf(jsonbBody) {
  return [...jsonbBody.matchAll(/'([a-z_][a-z0-9_]*)'\s*,/gi)].map((k) => k[1]);
}

/* Every insert into email_outbox that names its letter, in the LIVE body of
   the function that makes it. A function is defined many times across the
   corpus and only the last definition runs, so an insert in a superseded body
   is history, not a caller. Renames (alter function a rename to b) move the
   history with them: the last definition of handle_rsvp_aboard is superseded
   by the first definition of handle_pass_aboard. */
export function liveDefinitions(root) {
  const dir = join(root, "supabase/migrations");
  const defs = new Map(); // canonical name -> { file, body }
  const alias = new Map(); // old name -> new name
  const canon = (name) => {
    let n = name;
    while (alias.has(n)) n = alias.get(n);
    return n;
  };
  const files = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = sqlCode(readFileSync(join(dir, f), "utf8"));
    /* Renames first? No — in file order. A file that defines a function and
       renames it later in the same file is not a shape this corpus has. */
    const events = [];
    const defRe = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
    let m;
    while ((m = defRe.exec(sql))) events.push({ at: m.index, kind: "def", name: m[1].toLowerCase() });
    const renRe = /alter\s+function\s+(?:public\.)?([a-z_][a-z0-9_]*)\s*\([^)]*\)\s*rename\s+to\s+([a-z_][a-z0-9_]*)/gi;
    while ((m = renRe.exec(sql))) events.push({ at: m.index, kind: "rename", from: m[1].toLowerCase(), to: m[2].toLowerCase() });
    events.sort((a, b) => a.at - b.at);
    for (let e = 0; e < events.length; e++) {
      const ev = events[e];
      if (ev.kind === "rename") {
        const from = canon(ev.from);
        alias.set(from, ev.to);
        if (defs.has(from)) { defs.set(ev.to, defs.get(from)); defs.delete(from); }
        continue;
      }
      const next = events.slice(e + 1).find((x) => x.kind === "def");
      const body = sql.slice(ev.at, next ? next.at : sql.length);
      defs.set(canon(ev.name), { file: f, body });
    }
  }
  return defs;
}

export function liveCallers(root, knownCodes) {
  const defs = liveDefinitions(root);
  const callers = [];
  for (const [fn, { file, body }] of defs) {
    const re = /insert\s+into\s+public\.email_outbox/gi;
    let m;
    while ((m = re.exec(body))) {
      const stmt = statementAt(body, m.index);
      const line = body.slice(0, m.index).split("\n").length;
      /* The literal code, if the statement carries one. A variable in that
         position (run_automations) is a dynamic caller this gate cannot see. */
      const lit = [...stmt.matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]).find((c) => knownCodes.has(c));
      if (!lit) continue;
      const keys = new Set();
      for (const obj of jsonbObjects(stmt)) for (const k of keysOf(obj)) keys.add(k);
      callers.push({ code: lit, keys, where: `supabase/migrations/${file} (${fn}, +${line})` });
    }
  }

  /* Payloads built in TypeScript: queue_email(p_template, p_payload). */
  for (const file of sourceFiles(join(root, "src"))) {
    const src = stripComments(readFileSync(file, "utf8"));
    if (!src.includes("queue_email")) continue;
    const re = /p_template:\s*"([a-z0-9-]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      const keys = new Set();
      const after = src.slice(m.index);
      const pm = after.match(/p_payload:\s*\{/);
      if (pm) {
        let depth = 1;
        let i = pm.index + pm[0].length;
        const start = i;
        while (i < after.length && depth > 0) {
          if (after[i] === "{") depth++;
          else if (after[i] === "}") depth--;
          i++;
        }
        for (const k of after.slice(start, i - 1).matchAll(/(?:^|[{,\s])([a-z_][a-z0-9_]*)\s*:/gi)) keys.add(k[1]);
      }
      const line = src.slice(0, m.index).split("\n").length;
      callers.push({ code: m[1], keys, where: `${file.slice(root.length + 1)}:${line}` });
    }
  }
  return callers;
}

/* The visible text of every template literal in the sender: expressions
   removed, tags removed, entities decoded. Comments are stripped first so a
   backtick in prose cannot open a literal. */
function letterCopy(senderSrc) {
  const src = stripComments(senderSrc);
  const literals = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] !== "`") { i++; continue; }
    let j = i + 1;
    let text = "";
    let endsOnExpression = false;
    while (j < src.length && src[j] !== "`") {
      if (src[j] === "\\") { text += src[j + 1] ?? ""; j += 2; continue; }
      if (src[j] === "$" && src[j + 1] === "{") {
        let depth = 1;
        j += 2;
        while (j < src.length && depth > 0) {
          if (src[j] === "`") {
            /* A nested literal inside the expression: skip it whole. */
            j++;
            while (j < src.length && src[j] !== "`") { if (src[j] === "\\") j++; j++; }
            j++;
            continue;
          }
          if (src[j] === "{") depth++;
          else if (src[j] === "}") depth--;
          j++;
        }
        text += " ";
        endsOnExpression = true;
        continue;
      }
      text += src[j];
      endsOnExpression = false;
      j++;
    }
    literals.push({ raw: text, endsOnExpression });
    i = j + 1;
  }
  const visible = (raw) =>
    raw
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&mdash;/g, "—")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
  const subjects = [...src.matchAll(/subject:\s*"([^"]*)"/g)].map((m) => m[1]);
  return {
    bodies: literals.filter((l) => /<(p|table|div|td)\b/i.test(l.raw)),
    text: [...literals.map((l) => visible(l.raw)), ...subjects].filter(Boolean),
  };
}

// ---------- the gate ----------

export function letterInvariants({ root, note, banned }) {
  const at = "supabase/functions/send-outbox";
  let sender;
  try {
    sender = readFileSync(join(root, "supabase/functions/send-outbox/index.ts"), "utf8");
  } catch {
    return; /* the function is not in this checkout */
  }
  const code = stripComments(sender);

  const rendered = new Set([...code.matchAll(/^\s*"([a-z0-9-]+)":\s*\(p\)\s*=>/gm)].map((m) => m[1]));
  /* Legacy keys that render another letter: salon-invite -> port-invite. A
     caller that queues the alias is a caller of the letter it renders. */
  const aliasOf = new Map(
    [...code.matchAll(/templates\["([a-z0-9-]+)"\]\s*=\s*templates\["([a-z0-9-]+)"\]/g)].map((m) => [m[1], m[2]]),
  );
  const aliases = new Set(aliasOf.keys());
  const renderable = new Set([...rendered, ...aliases]);
  note(at, "the sender renders at least one letter", renderable.size > 0, renderable.size ? `${renderable.size} codes` : "no template keys were found — the extractor is broken");

  /* 1. registry <-> sender */
  const registry = readRegistry(root);
  const registered = new Set([...registry].filter(([, r]) => r.active).map(([c]) => c));
  note(at, "the letter registry could be read", registered.size > 0, registered.size ? `${registered.size} active codes` : "no registered letters were found");
  const listedButUnrenderable = [...registered].filter((c) => !renderable.has(c)).sort();
  const renderableButUnlisted = [...renderable].filter((c) => !registered.has(c)).sort();
  note(at, "the letter registry lists only letters that render", listedButUnrenderable.length === 0, listedButUnrenderable.join(", "));
  note(at, "every letter the sender renders is in the registry", renderableButUnlisted.length === 0, renderableButUnlisted.join(", "));
  for (const [c, r] of registry) {
    const prose = r.description.trim().length > 0 && !/["]/.test(r.description);
    note(at, `registry description for ${c} is prose the Bridge can show`, prose,
      prose ? "" : r.description ? "carries a double quote" : "is empty");
  }

  /* 2. keys read <-> keys written */
  const read = new Set([
    ...[...code.matchAll(/\bp\[\s*"([^"]+)"\s*\]/g)].map((m) => m[1]),
    ...[...code.matchAll(/\bp\.([a-z_][a-z0-9_]*)\b/g)].map((m) => m[1]),
  ]);
  const written = new Set();
  const migrations = join(root, "supabase/migrations");
  for (const f of readdirSync(migrations)) {
    for (const body of jsonbObjects(readFileSync(join(migrations, f), "utf8"))) {
      for (const k of keysOf(body)) written.add(k);
    }
  }
  for (const file of sourceFiles(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("email_outbox") && !src.includes("queue_email")) continue;
    for (const k of src.matchAll(/\b([a-z_][a-z0-9_]*)\s*:/gi)) written.add(k[1]);
  }
  const orphans = [...read].filter((k) => !written.has(k) && !(k in AWAITING_A_WRITER)).sort();
  note(at, "every template key is a key something writes", orphans.length === 0,
    orphans.length ? `read but never written: ${orphans.join(", ")}` : "");
  for (const [k, who] of Object.entries(AWAITING_A_WRITER)) {
    note(at, `${k} is still awaiting its writer (${who})`, !written.has(k),
      written.has(k) ? `something now writes ${k} — remove it from AWAITING_A_WRITER in scripts/lib/letters.mjs` : "");
    note(at, `${k} is read by a letter, or its exemption is stale`, read.has(k),
      read.has(k) ? "" : `nothing reads ${k} any more — remove it from AWAITING_A_WRITER`);
  }

  /* 3. every literal caller supplies what the letter requires */
  const requires = new Map();
  const reqBlock = code.match(/const REQUIRES[^=]*=\s*\{([\s\S]*?)\n\};/);
  note(at, "the sender declares what each letter requires", !!reqBlock, reqBlock ? "" : "no REQUIRES map");
  if (reqBlock) {
    for (const m of reqBlock[1].matchAll(/"([a-z0-9-]+)":\s*\[([^\]]*)\]/g)) {
      requires.set(m[1], [...m[2].matchAll(/"([a-z_][a-z0-9_]*)"/g)].map((x) => x[1]));
    }
    for (const c of requires.keys()) {
      note(at, `REQUIRES names a letter that renders: ${c}`, renderable.has(c));
    }
  }
  const callers = liveCallers(root, new Set([...renderable, ...registered]));
  note(at, "at least one caller was found in the live function bodies", callers.length > 0, callers.length ? `${callers.length} callers` : "the caller extractor found nothing");
  const called = new Set();
  for (const c of callers) {
    called.add(aliasOf.get(c.code) ?? c.code);
    const missing = (requires.get(c.code) ?? []).filter((k) => !c.keys.has(k));
    note(c.where, `queues ${c.code} with everything it requires`, missing.length === 0,
      missing.length ? `does not supply: ${missing.join(", ")}` : `supplies ${[...c.keys].join(", ") || "nothing (an empty payload)"}`);
    note(c.where, `queues a letter that renders: ${c.code}`, renderable.has(c.code));
  }

  /* 4. classification */
  const kinds = new Map();
  const kindBlock = code.match(/const LETTER_KIND[^=]*=\s*\{([\s\S]*?)\n\};/);
  note(at, "the sender classifies its letters", !!kindBlock, kindBlock ? "" : "no LETTER_KIND map");
  if (kindBlock) {
    for (const m of kindBlock[1].matchAll(/"([a-z0-9-]+)":\s*"(transactional|marketing)"/g)) kinds.set(m[1], m[2]);
    for (const c of renderable) {
      note(at, `${c} is classified transactional or marketing`, kinds.has(c), kinds.has(c) ? kinds.get(c) : "add it to LETTER_KIND");
    }
    for (const c of kinds.keys()) {
      note(at, `LETTER_KIND names a letter that renders: ${c}`, renderable.has(c));
    }
  }

  /* 5. the letters nobody sends are exactly the ones we know about */
  for (const c of LETTERS_WITHOUT_A_LITERAL_SENDER) {
    note(at, `${c} still has no caller that names it`, !called.has(c),
      called.has(c) ? `something now queues ${c} by name — remove it from LETTERS_WITHOUT_A_LITERAL_SENDER in scripts/lib/letters.mjs` : "");
    note(at, `${c} is a letter that renders, or its entry is stale`, renderable.has(c));
  }
  for (const c of rendered) {
    if (LETTERS_WITHOUT_A_LITERAL_SENDER.includes(c)) continue;
    note(at, `${c} has a caller that names it`, called.has(c),
      called.has(c) ? "" : "a letter nobody sends — wire a sender, or list it in LETTERS_WITHOUT_A_LITERAL_SENDER with the reason");
  }

  /* 6. lexicon */
  const copy = letterCopy(sender);
  note(at, "the letter copy could be read", copy.text.length > 0, copy.text.length ? `${copy.text.length} passages` : "no template literals were found");
  const hay = copy.text.join("\n");
  const lower = hay.toLowerCase();
  const offLexicon = banned.filter((term) => lower.includes(term.toLowerCase()));
  note(at, "letters are on-lexicon", offLexicon.length === 0, offLexicon.length ? `banned terms: ${offLexicon.join(", ")}` : "");
  const named = LETTER_BANS.filter((re) => re.test(hay)).map((re) => String(re));
  note(at, "letters never name a camera, a retired noun or a shout", named.length === 0, named.join(", "));
  const shouts = (hay.match(/!/g) || []).length;
  note(at, "the producer never shouts in a letter", shouts === 0, shouts ? `${shouts} exclamation mark(s)` : "");
  const emoji = hay.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{268F}\u{2692}-\u{2712}\u{2714}-\u{27BF}\u{FE0F}]/u);
  note(at, "no emoji in a letter", !emoji, emoji ? `found ${emoji[0]}` : "");

  /* 7. no letter body ends on a variable */
  const trailing = copy.bodies.filter((b) => b.endsOnExpression);
  note(at, "no letter body ends on a variable", trailing.length === 0,
    trailing.length ? `${trailing.length} body literal(s) end on an interpolation` : "");

  /* 8. a rule can only name a letter it can fill. run_automations queues a
     letter with the member and the episode and nothing else; a letter that
     REQUIRES more is refused by the sender at drain time, after the row is
     queued, and the member gets nothing. The Bridge's picker drops those
     letters by a list in automation-letters.ts, and this holds that list
     equal to the sender's REQUIRES, and the keys it assumes equal to what the
     live dispatcher body actually writes. */
  const rulesAt = "src/app/(staff)/bridge/automations/automation-letters.ts";
  let rulesSrc = null;
  try { rulesSrc = stripComments(readFileSync(join(root, rulesAt), "utf8")); } catch { /* not in this checkout */ }
  note(rulesAt, "the automation letter list could be read", !!rulesSrc);
  if (rulesSrc && reqBlock) {
    const keysM = rulesSrc.match(/AUTOMATION_LETTER_KEYS\s*=\s*\[([^\]]*)\]/);
    const ruleKeys = new Set([...(keysM?.[1] ?? "").matchAll(/"([a-z_][a-z0-9_]*)"/g)].map((m) => m[1]));
    const listM = rulesSrc.match(/LETTERS_A_RULE_CANNOT_FILL[^=]*=\s*\{([\s\S]*?)\n\};/);
    const cannot = new Map();
    for (const m of (listM?.[1] ?? "").matchAll(/"([a-z0-9-]+)":\s*"([^"]*)"/g)) cannot.set(m[1], m[2]);
    note(rulesAt, "the list names the keys a rule carries", ruleKeys.size > 0, [...ruleKeys].join(", "));
    for (const [c, needs] of requires) {
      const unfilled = needs.filter((k) => !ruleKeys.has(k));
      if (unfilled.length) {
        const named = cannot.get(c);
        note(rulesAt, `${c} is kept off the rule picker, naming what a rule cannot carry`,
          !!named && unfilled.every((k) => named.split(/[\s,]+/).includes(k)),
          named ? `lists "${named}", the sender requires ${unfilled.join(", ")}` : `the sender requires ${unfilled.join(", ")} — add it to LETTERS_A_RULE_CANNOT_FILL`);
      } else {
        note(rulesAt, `${c} is not kept off the rule picker — a rule can fill it`, !cannot.has(c),
          cannot.has(c) ? `listed as needing ${cannot.get(c)}, but a rule carries ${needs.join(", ") || "nothing it requires"}` : "");
      }
    }
    for (const c of cannot.keys()) {
      note(rulesAt, `${c} in LETTERS_A_RULE_CANNOT_FILL is a letter the sender requires something of`, requires.has(c),
        requires.has(c) ? "" : "the sender no longer requires anything of it — remove the entry");
    }
    /* What the dispatcher actually writes. Its insert names the code as a
       variable, so liveCallers cannot see it; the body is read directly. */
    const dispatcher = liveDefinitions(root).get("run_automations");
    note(rulesAt, "the live run_automations body could be found", !!dispatcher, dispatcher?.file ?? "");
    if (dispatcher) {
      const m = /insert\s+into\s+public\.email_outbox/i.exec(dispatcher.body);
      const stmt = m ? statementAt(dispatcher.body, m.index) : "";
      const written = new Set();
      for (const obj of jsonbObjects(stmt)) for (const k of keysOf(obj)) written.add(k);
      const same = written.size > 0 && written.size === ruleKeys.size && [...written].every((k) => ruleKeys.has(k));
      note(rulesAt, "AUTOMATION_LETTER_KEYS is what the live dispatcher writes", same,
        `dispatcher writes ${[...written].join(", ") || "nothing"}; the list says ${[...ruleKeys].join(", ")} (${dispatcher.file})`);
    }
  }
}
