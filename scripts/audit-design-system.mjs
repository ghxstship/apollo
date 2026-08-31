#!/usr/bin/env node
/* [UN] design-system conformance linter.

   Measures the app's CSS and TSX against `docs/brand/_handoff/`. Every rule
   here quotes the handoff clause it enforces, so a disagreement is settled by
   reading the package rather than by arguing about intent.

   Run:  node scripts/audit-design-system.mjs [--json] [--only=weights,scale,...]
   Exit: 0 when every enabled check is clean, 1 otherwise.

   Suppression: put `ds-exempt: <reason>` in a CSS comment on the same line as
   the declaration. The reason is required and is echoed in the report, so an
   exemption is a documented decision rather than a silent one. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const HANDOFF = join(ROOT, "docs/brand/_handoff");

/* ── the published values, read from the package rather than retyped ──────── */

const typographyCss = readFileSync(join(HANDOFF, "tokens/typography.css"), "utf8");

/* --text-3xs:9px; … --text-5xl:64px;  →  [9,10,12,…,64] */
const LADDER = [...typographyCss.matchAll(/--text-(?:[0-9a-z]+):\s*(\d+)px/g)]
  .map((m) => Number(m[1]))
  .sort((a, b) => a - b);

/* fonts.css pins the families and the weights actually fetched:
   Archivo:wght@400;500;700 · Space Mono:wght@400;700 · Anton (400) ·
   Instrument Serif (400). §"Type": "Archivo in three weights only". */
const fontsCss = readFileSync(join(HANDOFF, "tokens/fonts.css"), "utf8");
const LOADED_WEIGHTS = new Set(
  [...fontsCss.matchAll(/wght@([\d;]+)/g)].flatMap((m) => m[1].split(";").map(Number))
);
LOADED_WEIGHTS.add(400); /* Anton and Instrument Serif ship a single 400 face */

const POSTER_FLOOR = Math.max(...LADDER); /* above this, type is set optically */
const ANTON_FLOOR = 22; /* "Anton for display ≥22px … below 22px … Archivo 700" */

/* ── file collection ──────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const ALL = walk(join(ROOT, "src")).concat(walk(join(ROOT, "public")));
const CSS = ALL.filter((p) => extname(p) === ".css");
const CODE = ALL.filter((p) => [".ts", ".tsx", ".mjs", ".js"].includes(extname(p)));

/* tokens.css and public/brand/un-tokens.css are the published token surface —
   they DECLARE the vocabulary and are not app usage. Everything else is. */
const isTokenFile = (p) => /styles\/tokens\.css$|brand\/un-tokens\.css$/.test(p);
const APP_CSS = CSS.filter((p) => !isTokenFile(p));

const rel = (p) => relative(ROOT, p);
const lines = (p) => readFileSync(p, "utf8").split("\n");
const exempt = (line) => {
  const m = line.match(/ds-exempt:\s*([^*]+?)\s*(?:\*\/|$)/);
  return m ? m[1] : null;
};

/* ── check: font weights ──────────────────────────────────────────────────── */
/* §Type: "Archivo in three weights only: 400 body · 500 buttons/UI · 700
   headings." A weight the webfont loader never fetches is synthesised by the
   browser — a smeared fake bold, not the design. */

function checkWeights() {
  const hits = [];
  const KEYWORD = { normal: 400, bold: 700, bolder: 700, lighter: 400 };
  for (const p of APP_CSS) {
    lines(p).forEach((line, i) => {
      const found = [];
      for (const m of line.matchAll(/font-weight:\s*([a-z0-9]+)/g)) {
        found.push(KEYWORD[m[1]] ?? Number(m[1]));
      }
      /* font shorthand: `font: 600 11px var(--font-sans)` */
      for (const m of line.matchAll(/(?:^|[;{\s])font:\s*(?:italic\s+)?(\d{3})\s/g)) {
        found.push(Number(m[1]));
      }
      for (const w of found) {
        if (Number.isNaN(w) || LOADED_WEIGHTS.has(w)) continue;
        const why = exempt(line);
        hits.push({ file: rel(p), line: i + 1, weight: w, exempt: why, text: line.trim().slice(0, 120) });
      }
    });
  }
  return {
    name: "weights",
    rule: `font weights must be among the loaded faces {${[...LOADED_WEIGHTS].sort().join(",")}}`,
    hits: hits.filter((h) => !h.exempt),
    exempted: hits.filter((h) => h.exempt),
  };
}

/* ── check: type scale ────────────────────────────────────────────────────── */
/* §Type: "canonical scale 9/10/12/14/16/18/22/28/36/48/64 — no off-scale sizes
   at or below 64px". Above 64px is poster scale and is set optically. */

function checkScale() {
  const hits = [];
  let total = 0;
  for (const p of APP_CSS) {
    lines(p).forEach((line, i) => {
      const sizes = [];
      for (const m of line.matchAll(/font-size:\s*([^;}]+)/g)) sizes.push(m[1]);
      for (const m of line.matchAll(/(?:^|[;{\s])font:\s*(?:italic\s+)?(?:\d{3}\s+)?([\d.]+px)/g)) sizes.push(m[1]);
      for (const raw of sizes) {
        const v = raw.trim();
        /* var(--text-*) and em/%/ch values resolve through the ladder or scale
           with a parent that was already checked. clamp() is a range, so every
           value between its ends is a rendered size — §Type grants no fluid
           exemption, and the compat layer already de-clamped the display scale. */
        if (/^var\(/.test(v)) { total++; continue; }
        if (/^[\d.]+(em|rem|%|ch)$/.test(v)) { total++; continue; }
        const px = [...v.matchAll(/([\d.]+)px/g)].map((m) => Number(m[1]));
        if (!px.length) { total++; continue; }
        total++;
        const off = px.filter((n) => n <= POSTER_FLOOR && !LADDER.includes(n));
        if (!off.length) continue;
        const why = exempt(line);
        hits.push({
          file: rel(p), line: i + 1, sizes: off, fluid: /clamp\(/.test(v),
          exempt: why, text: line.trim().slice(0, 120),
        });
      }
    });
  }
  return {
    name: "scale",
    rule: `px font-sizes ≤${POSTER_FLOOR} must be on the ladder [${LADDER.join(",")}]`,
    total,
    hits: hits.filter((h) => !h.exempt),
    exempted: hits.filter((h) => h.exempt),
  };
}

/* ── check: display family floor + caps ───────────────────────────────────── */
/* §Type: "Anton for display ≥22px, ALL CAPS always (via text-transform) …
   below 22px headings are Archivo 700, sentence case."
   §Capitalization: "Set uppercase with text-transform, not typed caps."

   The size may arrive as a TOKEN, not a literal — `font-size:var(--text-md)`
   set --font-display at 16px and the literal-px reading passed it, the same
   under-report that made the previous checker (check-type-system.mjs) miss a
   36px Anton heading and say clean. So sizes resolve through the declared
   custom properties, following aliases ACROSS stylesheets (--text-display-m
   lives in compat.css as var(--text-3xl), whose px lives in tokens.css). A
   font-size this resolver cannot bottom out is FLAGGED, not skipped: an
   unresolvable size is exactly where the next off-ladder value will hide. */

/* --name -> px, resolved across every stylesheet with alias-following.
   Where a name is declared more than once (themes, compat), the SMALLEST px
   wins — the floor check cares about the lowest size a rule can render. */
function buildPxResolver() {
  const decls = new Map(); /* name -> [raw values] */
  for (const p of CSS) {
    for (const line of lines(p)) {
      for (const m of line.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
        if (!decls.has(m[1])) decls.set(m[1], []);
        decls.get(m[1]).push(m[2].trim());
      }
    }
  }
  const resolve = (name, depth = 0) => {
    if (depth > 4 || !decls.has(name)) return null;
    let min = null;
    for (const raw of decls.get(name)) {
      let px = null;
      const lit = raw.match(/^([\d.]+)px$/);
      const alias = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/);
      if (lit) px = Number(lit[1]);
      else if (alias) px = resolve(alias[1], depth + 1);
      if (px !== null && (min === null || px < min)) min = px;
    }
    return min;
  };
  return resolve;
}

function checkDisplay() {
  const below = [], nocaps = [];
  const px = buildPxResolver();
  for (const p of APP_CSS) {
    lines(p).forEach((line, i) => {
      if (!/font-family:\s*var\(--font-display\)|font:[^;}]*var\(--font-display\)/.test(line)) return;
      const why = exempt(line);
      const rec = { file: rel(p), line: i + 1, exempt: why, text: line.trim().slice(0, 120) };
      /* every font-size the line sets: longhand, or the size slot of the
         `font:` shorthand (before the optional /line-height) */
      const sizeExprs = [
        ...[...line.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1]),
        ...[...line.matchAll(/(?:^|[;{\s])font:\s*(?:italic\s+)?(?:\d{3}\s+)?(clamp\([^)]*\)|var\(--[a-z0-9-]+\)|[\d.]+px)/g)].map((m) => m[1]),
      ];
      for (const expr of sizeExprs) {
        const sizes = [];
        let unresolved = null;
        for (const m of expr.matchAll(/([\d.]+)px/g)) sizes.push(Number(m[1]));
        for (const m of expr.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
          const v = px(m[1]);
          if (v === null) unresolved = m[1];
          else sizes.push(v);
        }
        if (unresolved && !sizes.length) {
          below.push({ ...rec, size: `unresolvable ${unresolved}` });
          continue;
        }
        if (!sizes.length) continue;
        const floor = Math.min(...sizes);
        if (floor < ANTON_FLOOR) below.push({ ...rec, size: floor });
      }
      if (!/text-transform:\s*uppercase/.test(line)) nocaps.push(rec);
    });
  }
  return [
    { name: "display-floor", rule: `--font-display must not be set below ${ANTON_FLOOR}px`,
      hits: below.filter((h) => !h.exempt), exempted: below.filter((h) => h.exempt) },
    { name: "display-caps", rule: "every --font-display rule must set text-transform:uppercase",
      hits: nocaps.filter((h) => !h.exempt), exempted: nocaps.filter((h) => h.exempt) },
  ];
}

/* ── check: motion ────────────────────────────────────────────────────────── */
/* §Motion: "cinematic ease-out (--ease-out), 120–320ms UI, 560ms for
   scene-level reveals. Fades and small translates; no bounces, no spins."
   tokens/motion.css tops out at --dur-cine 560ms and ships no linear curve. */

function checkMotion() {
  const motionCss = readFileSync(join(HANDOFF, "tokens/motion.css"), "utf8");
  const MAX_MS = Math.max(...[...motionCss.matchAll(/--dur-[a-z]+:\s*(\d+)ms/g)].map((m) => Number(m[1])));
  const hits = [];
  for (const p of APP_CSS) {
    lines(p).forEach((line, i) => {
      for (const m of line.matchAll(/animation(?:-duration)?:\s*([^;}]+)/g)) {
        const v = m[1];
        const why = exempt(line);
        const ms = [...v.matchAll(/([\d.]+)(m?s)\b/g)].map((x) => (x[2] === "s" ? Number(x[1]) * 1000 : Number(x[1])));
        const tooLong = ms.filter((n) => n > MAX_MS);
        const isLinear = /\blinear\b/.test(v);
        const isInfinite = /\binfinite\b/.test(v);
        if (tooLong.length || isLinear) {
          hits.push({
            file: rel(p), line: i + 1, exempt: why,
            why: [tooLong.length ? `${tooLong.join(",")}ms > --dur-cine ${MAX_MS}ms` : null,
                  isLinear ? "linear easing is not in tokens/motion.css" : null,
                  isInfinite ? "infinite iteration" : null].filter(Boolean).join(" · "),
            text: line.trim().slice(0, 120),
          });
        }
      }
    });
  }
  return { name: "motion", rule: `animations stay ≤${MAX_MS}ms and use a token easing (no linear)`,
    hits: hits.filter((h) => !h.exempt), exempted: hits.filter((h) => h.exempt) };
}

/* ── check: token consumers ───────────────────────────────────────────────── */
/* A published custom property with no reader is either unwired UI or dead
   vocabulary. Either way the owner should know which.

   Some declared names are VOCABULARY the handoff publishes on purpose, and an
   app consumer is not expected — for the physical-goods accents one would be a
   violation in itself. Each entry below quotes the clause that sanctions it, in
   the same spirit as ds-exempt: a documented decision, echoed in the report,
   never a silent skip. Anything not matched here that has no reader is still a
   finding. */
const TOKEN_VOCABULARY = [
  { match: /^--(noir|ivory|acid|magenta|orchid|amber|grid|fuchsia|terracotta)-\d+$/,
    clause: "§Color publishes full ramps; the app reads steps through the semantic aliases (--accent-*, --brand-*, --text-*, --surface-*), and the kit's artwork reads the rest" },
  { match: /^--(rose|sea|sun)-\d+$|^--brand-(social|dating|yacht)$/,
    clause: "readme §Index: 'legacy ramps · retained for apollo API compatibility' / 'legacy aliases'" },
  { match: /^--(golden-sand|crimson-deck|saltwater-blue|deep-offshore|sunbleached-oxford)$/,
    clause: "§Color: 'sanctioned for made objects only … never for screen UI' — a src consumer would itself be the violation" },
  { match: /^--(void|neon-canvas)$/,
    clause: "tokens/colors.css: 'synthwave grounds — for gradient scenes and motion only; page surfaces stay paper-first greyscale'" },
  { match: /^--(space-20|radius-xs|radius-lg|dur-slow)$/,
    clause: "§Spacing/§Borders/§Motion publish complete scales — an unconsumed step is published range, not debt" },
  { match: /^--type-(display|editorial)$/,
    clause: "composite presets the kit's own templates set; app surfaces compose longhand from the ladder" },
  { match: /^--text-inverse$/,
    clause: "counterpart of --text-body, correct only on grounds that flip with the theme — every current ink ground is FIXED ink and correctly reads the ivory ramp instead" },
];

function checkTokens() {
  const declared = new Map(); /* name -> file */
  for (const p of CSS.filter(isTokenFile).concat(CSS.filter((f) => /compat\.css$/.test(f)))) {
    /* Strip block comments BEFORE scanning for declarations, preserving line
       breaks so reported line numbers stay true — a comment that says
       "--track-button: retired" is prose about a token, not a declaration of
       one, and a checker that fires on the explanation invites the fix of
       rewording the explanation. (Consumer scanning below stays unstripped on
       purpose: a var() in a comment can only under-report an orphan, never
       invent one, and the strings scan in TSX has no comment grammar at all.) */
    const stripped = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    stripped.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
        if (!declared.has(m[1])) declared.set(m[1], `${rel(p)}:${i + 1}`);
      }
    });
  }
  const used = new Set();
  for (const p of CSS.concat(CODE)) {
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) used.add(m[1]);
    /* a token referenced by name from JS/TSX (style objects, getComputedStyle) */
    for (const m of src.matchAll(/["'`](--[a-z0-9-]+)["'`]/gi)) used.add(m[1]);
  }
  const orphans = [...declared].filter(([n]) => !used.has(n)).map(([n, where]) => {
    const vocab = TOKEN_VOCABULARY.find((v) => v.match.test(n));
    return { token: n, declaredAt: where, exempt: vocab ? vocab.clause : null };
  });
  return { name: "tokens", rule: "every declared custom property has at least one var() consumer",
    total: declared.size, hits: orphans.filter((o) => !o.exempt), exempted: orphans.filter((o) => o.exempt) };
}

/* ── check: named vocabulary ──────────────────────────────────────────────── */
/* §Named vocabulary: "Use verbatim; never substitute generic equivalents." */

function checkVocab() {
  const readme = readFileSync(join(HANDOFF, "readme.md"), "utf8");
  const block = readme.split("## Named vocabulary")[1]?.split("\n##")[0] ?? "";
  const terms = [...block.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].trim());
  const surfaces = CODE.filter((p) => /\/src\/(app|components|lib)\//.test(p));
  const corpus = surfaces.map((p) => readFileSync(p, "utf8")).join("\n");
  const missing = terms.filter((t) => !corpus.includes(t));
  return { name: "vocab", rule: "every term in §Named vocabulary appears verbatim in a user-facing surface",
    total: terms.length, hits: missing.map((t) => ({ term: t })), exempted: [] };
}

/* ── report ───────────────────────────────────────────────────────────────── */

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const checks = [checkWeights(), checkScale(), ...checkDisplay(), checkMotion(), checkTokens(), checkVocab()]
  .filter((c) => !only || only.includes(c.name));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(checks, null, 2));
} else {
  let failed = 0;
  for (const c of checks) {
    const n = c.hits.length;
    if (n) failed++;
    const scope = c.total !== undefined ? ` (of ${c.total} checked)` : "";
    console.log(`\n${n ? "FAIL" : "ok  "}  ${c.name.padEnd(14)} ${n} violation${n === 1 ? "" : "s"}${scope}` +
      (c.exempted.length ? `, ${c.exempted.length} exempted` : ""));
    console.log(`        ${c.rule}`);
    for (const h of c.hits.slice(0, 40)) {
      const where = h.file ? `${h.file}:${h.line}` : h.token || h.term;
      const detail = h.weight ?? (h.sizes ? h.sizes.join(",") + "px" : h.size !== undefined ? `${h.size}${typeof h.size === "number" ? "px" : ""}` : "");
      console.log(`        · ${where}${detail ? ` — ${detail}` : ""}${h.why ? ` — ${h.why}` : ""}${h.declaredAt ? ` — declared ${h.declaredAt}` : ""}`);
    }
    if (c.hits.length > 40) console.log(`        … and ${c.hits.length - 40} more`);
  }
  console.log(`\n${failed ? `${failed} check(s) failing` : "all checks clean"}`);
  process.exit(failed ? 1 : 0);
}
