#!/usr/bin/env node
/* [un] design-system conformance linter.

   Measures the app's CSS and TSX against `docs/brand/_handoff/`. Every rule
   here quotes the handoff clause it enforces, so a disagreement is settled by
   reading the package rather than by arguing about intent.

   Run:  node scripts/audit-design-system.mjs [--json] [--only=weights,scale,...]
   Exit: 0 when every enabled check is clean, 1 otherwise.

   Suppression: put `ds-exempt: <reason>` in a CSS comment on the same line as
   the declaration. The reason is required and is echoed in the report, so an
   exemption is a documented decision rather than a silent one.

   Where an exemption is a property of the FILE rather than of a line — a
   component next/og rasterises with no cascade, a token the package publishes
   with no app consumer on purpose — it is written as a table in this script
   (TOKEN_VOCABULARY, RASTER_EXEMPT, CONTRAST_VOCABULARY) with the clause that
   sanctions it. Same contract as ds-exempt: a reason is required, it is counted
   in the report, and nothing is ever skipped silently. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";

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

/* ── check: tracking ──────────────────────────────────────────────────────── */
/* §Type ships five tracking steps — display .01 · body 0 · dense .12 · label
   .16 · strap .24 — plus the documented mono-data exception at .04. Every one
   of them is a token, and nothing was checking that a stylesheet used them.

   It drifted where you would expect: the Log masthead set an Anton heading at
   .3em with a -.3em margin to cancel the trailing gap — thirty times the
   display step, and the only letterspaced heading in the app. Nothing caught
   it because the other checks read font-size, weight and family, never
   tracking.

   A literal is allowed only where it is 0 or normal (which say "no tracking"
   unambiguously and need no token), or where the line carries a ds-exempt
   note. Everything else states which step it means. */

const TRACK_OK = /^(0|normal|var\(--(tracking|track)-[a-z]+\))$/;

function checkTracking() {
  const hits = [];
  let total = 0;
  for (const p of APP_CSS) {
    lines(p).forEach((line, i) => {
      for (const m of line.matchAll(/letter-spacing:\s*([^;}]+)/g)) {
        total++;
        const v = m[1].trim();
        if (TRACK_OK.test(v)) continue;
        const why = exempt(line);
        const hit = { file: rel(p), line: i + 1, why: `${v} — not a tracking token` };
        if (why) hits.push({ ...hit, exempt: why });
        else hits.push(hit);
      }
    });
  }
  return {
    name: "tracking",
    rule: "letter-spacing comes from a tracking token (or is 0/normal)",
    total,
    hits: hits.filter((h) => !h.exempt),
    exempted: hits.filter((h) => h.exempt),
  };
}

/* ── check: inline styles ─────────────────────────────────────────────────── */
/* The blind spot every other check had. checkWeights, checkScale and
   checkDisplay all walk APP_CSS, so nothing inside a React `style={{…}}` was
   ever measured — and that is precisely where the drift collected: Anton set
   at 17, 19 and 20px against its own 22px floor, `fontWeight: 600` that
   Archivo cannot render so the browser fakes it, and well over a hundred
   off-ladder sizes like 12.5 and 13.5 doing the job of both 12 and 14.
   Roughly two hundred violations were shipping green.

   Same three rules as the CSS checks, read out of JSX style objects. A size
   given as a var() or an em resolves through the ladder and passes, exactly as
   it does in the stylesheet. */

function checkInline() {
  const hits = [];
  let total = 0;
  const files = CODE.filter((p) => /\/src\//.test(p) && /\.tsx?$/.test(p));
  for (const p of files) {
    lines(p).forEach((line, i) => {
      const why = exempt(line);
      const push = (h) => hits.push({ file: rel(p), line: i + 1, exempt: why, ...h });

      /* fontSize: 13 · fontSize: "13.5px" · fontSize: 24 */
      for (const m of line.matchAll(/fontSize:\s*"?([\d.]+)(?:px)?"?[,\s}]/g)) {
        total++;
        const n = Number(m[1]);
        if (n > POSTER_FLOOR || LADDER.includes(n)) continue;
        push({ size: n, why: `off the ladder [${LADDER.join(",")}]` });
      }

      /* fontWeight: 600 — Archivo ships 400/500/700; anything else is synthesised */
      for (const m of line.matchAll(/fontWeight:\s*"?(\d{3})"?/g)) {
        total++;
        const w = Number(m[1]);
        if (LOADED_WEIGHTS.has(w)) continue;
        push({ weight: w, why: "no such face is loaded — the browser fakes it" });
      }

      /* Anton below its floor, or without the caps it is only ever set in. */
      if (/--font-display/.test(line)) {
        total++;
        const size = line.match(/fontSize:\s*"?([\d.]+)(?:px)?"?/);
        if (size && Number(size[1]) < ANTON_FLOOR) {
          push({ size: Number(size[1]), why: `display face below the ${ANTON_FLOOR}px floor` });
        }
      }
    });
  }
  return {
    name: "inline",
    rule: "JSX style objects obey the same ladder, weights and display floor as the stylesheets",
    total,
    hits: hits.filter((h) => !h.exempt),
    exempted: hits.filter((h) => h.exempt),
  };
}

/* ── colour: the measuring instrument the gate never had ──────────────────── */
/* Ten checks read size, weight, family, tracking and duration, and not one of
   them read a COLOUR. Everything the 2026-09-02 palette review found was
   therefore invisible here: the house accent sitting 0.2° in OKLCH from
   --positive (the same colour under two token names), five division hues spread
   over a 0.3 lightness range when brand.ts promises "a division swaps the accent
   and nothing else", and --text-faint painting stat labels and ledger metadata
   at 2.96:1 — below AA and below even the 3:1 large-text floor — in BOTH themes.
   None of it was a typo. All of it was unmeasured.

   Colour is measured in OKLCH rather than in hex or HSL because hue reservation
   and "these two are the same colour" are perceptual claims, and sRGB's
   coordinates are not perceptual: #FF8C00 and #F72585 are 90 HSL degrees apart
   and look further apart than #3EC317 and #2FA114, which are 8. OKLCH is the
   space the palette file itself reasons in, so the check and the decision use
   one vocabulary. Contrast stays in WCAG's own sRGB relative luminance, because
   that is the ratio the success criterion is written in — measuring it in a
   better space would produce a number that is not the one being conformed to. */

/* sRGB 0–255 → OKLCH. Björn Ottosson's matrices, unmodified. */
function oklch({ r, g, b }) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const R = lin(r / 255), G = lin(g / 255), B = lin(b / 255);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  let H = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    C: Math.hypot(A, Bb),
    H,
  };
}

/* WCAG 2.x relative luminance and contrast ratio — §1.4.3's own formulae. */
function luminance({ r, g, b }) {
  const f = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/* A translucent value renders as its composite over whatever is behind it, so a
   ratio computed from the raw rgba() is a ratio nobody ever sees. */
function over(fg, bg) {
  if (fg.a === undefined || fg.a >= 1) return fg;
  return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}

function parseColor(raw) {
  const v = raw.trim();
  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
             a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
  }
  const fn = v.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null; /* gradients, url(), keywords — not a flat colour */
}

/* The cascade, not the file. tokens.css declares --brand-limited as outrun amber
   and palette.css overrides it to a cool blue; the amber declaration is still on
   disk and always will be, because tokens.css is a verbatim copy of the handoff
   package that "MUST NOT be renamed, re-scaled, or tidied here". A check that
   measured declarations rather than the resolved cascade would report a pile of
   violations that are already fixed AND unfixable at source — the worst kind of
   red, the kind whose only available response is to disable the check.
   So: the three colour-bearing layers in @import order (tokens · palette ·
   compat), later declaration wins, var() aliases followed, and the ink theme
   falling back to :root exactly as the browser does for a name it never
   redeclares. compat.css is in the table because the --text-inverse-* ramps the
   contrast check needs live there and nowhere else. */
const COLOR_LAYERS = ["src/styles/tokens.css", "src/styles/palette.css", "src/styles/compat.css"];
const PALETTE_LAYERS = ["src/styles/tokens.css", "src/styles/palette.css"];

function buildColorTable() {
  const decls = { root: new Map(), dark: new Map() };
  for (const relPath of COLOR_LAYERS) {
    const p = join(ROOT, relPath);
    /* comments stripped first, newlines kept so reported lines stay true — the
       palette file's header quotes half a dozen hexes as prose. */
    const src = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    let theme = null;
    src.split("\n").forEach((line, i) => {
      if (/:root\s*\{/.test(line)) theme = "root";
      else if (/\[data-theme="dark"\]\s*\{/.test(line)) theme = "dark";
      else if (/^\s*\}/.test(line)) { theme = null; return; }
      if (!theme) return;
      for (const m of line.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
        decls[theme].set(m[1], { raw: m[2].trim(), where: `${relPath}:${i + 1}`, layer: relPath });
      }
    });
  }
  const declOf = (name, theme) => decls[theme].get(name) ?? (theme === "dark" ? decls.root.get(name) : undefined);
  const resolve = (name, theme, depth = 0) => {
    const d = declOf(name, theme);
    if (!d || depth > 6) return null;
    const direct = parseColor(d.raw);
    if (direct) return { ...direct, where: d.where };
    const alias = d.raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i);
    if (alias) {
      const via = resolve(alias[1], theme, depth + 1);
      if (via) return { ...via, where: d.where };
      const fallback = alias[2] ? parseColor(alias[2]) : null;
      return fallback ? { ...fallback, where: d.where } : null;
    }
    return null;
  };
  /* names declared by the published token surface + the owner's palette — the
     vocabulary the hue rules govern. compat aliases are call-site names, not
     palette decisions, so they are resolved but never themselves arraigned. */
  const paletteNames = new Set();
  for (const theme of ["root", "dark"]) {
    for (const [name, d] of decls[theme]) if (PALETTE_LAYERS.includes(d.layer)) paletteNames.add(name);
  }
  return { resolve, declOf, paletteNames };
}

const COLORS = buildColorTable();

/* :root is the paper theme, [data-theme="dark"] is the ink theme. Every colour
   rule is evaluated in both, because a token that clears AA on paper and fails
   on ink has failed. */
const THEMES = [["root", "paper"], ["dark", "ink"]];

/* Below this chroma a colour has no hue worth reserving: the angle is numerical
   noise off a near-neutral, and comparing it to anything is comparing nothing.
   The house accent is deliberately in this band — Option C made it ink on paper
   and ivory on ink — so a hue-gap check that did not skip it would measure the
   ~106° that #141414 happens to land on and invent a collision. */
const ACHROMATIC = 0.03;

/* The reservation, as a computable rule rather than a comment repeated in three
   stylesheets. Operational state and club identity must never be confusable, so
   they get disjoint halves of the wheel: state lives warm (the green/amber/red
   convention nobody should have to relearn), identity lives cool. The arcs are
   not adjacent — 150→180 and 360→20 are unclaimed buffer, which is what stops a
   division and a status reading as the same signal at a glance. */
const WARM = [20, 150];
const COOL = [180, 360];

function checkHueArc() {
  const hits = [], exempted = [];
  const subjects = [
    ...[...COLORS.paletteNames].filter((n) => /^--(positive|caution|danger)$/.test(n)).map((n) => [n, "status", WARM]),
    ...[...COLORS.paletteNames].filter((n) => /^--brand-[a-z-]+$/.test(n)).map((n) => [n, "identity", COOL]),
  ];
  for (const [theme, label] of THEMES) {
    for (const [name, kind, arc] of subjects) {
      const c = COLORS.resolve(name, theme);
      if (!c) continue;
      const { C, H } = oklch(c);
      if (C < ACHROMATIC) {
        /* --brand-shop resolves to ink on purpose: the Shop is a sales channel,
           not a division, and a channel with no mark needs no hue. */
        exempted.push({ token: `${name} (${label})`, why: `achromatic (chroma ${C.toFixed(3)}) — no hue to reserve` });
        continue;
      }
      const inArc = H >= arc[0] && H <= arc[1];
      if (inArc) continue;
      hits.push({
        token: `${name} (${label})`,
        declaredAt: c.where,
        why: `hue ${H.toFixed(1)}° — ${kind} must sit in the ${kind === "status" ? "WARM" : "COOL"} arc ${arc[0]}–${arc[1]}°`,
      });
    }
  }
  return {
    name: "hue-arc",
    rule: `status hues stay warm ${WARM[0]}–${WARM[1]}°, identity hues stay cool ${COOL[0]}–${COOL[1]}° — operational state never takes a division hue`,
    total: subjects.length * 2,
    hits, exempted,
  };
}

/* ── check: hue separation ────────────────────────────────────────────────── */
/* The check that would have caught Option C's founding defect. The shipped
   accent was acid green at OKLCH hue 140.4 and --positive on ink was 140.2:
   two tenths of a degree, which is far below a just-noticeable difference at any
   size on any display. They were not similar colours, they were ONE colour
   wearing two token names, and every "is this live or is this healthy?" the UI
   asked was unanswerable. Nothing in the gate could see it, because nothing in
   the gate could see colour.

   30° is the floor because the divisions are laid out 41° apart by construction
   and status sits between the arcs; anything under 30 means two independently
   meaningful signals have collided rather than been placed. Achromatic members
   are skipped, not compared — see ACHROMATIC above. */
const HUE_FLOOR = 30;

function checkHueGap() {
  const members = ["--accent", "--brand-scripted", "--brand-limited", "--brand-bound", "--brand-cut", "--brand-hinged",
                   "--positive", "--caution", "--danger"];
  const hits = [], exempted = [];
  let total = 0;
  for (const [theme, label] of THEMES) {
    const wheel = [];
    for (const name of members) {
      const c = COLORS.resolve(name, theme);
      if (!c) continue;
      const { C, H } = oklch(c);
      if (C < ACHROMATIC) { exempted.push({ token: `${name} (${label})`, why: `achromatic (chroma ${C.toFixed(3)})` }); continue; }
      wheel.push({ name, H });
    }
    for (let i = 0; i < wheel.length; i++) {
      for (let j = i + 1; j < wheel.length; j++) {
        total++;
        const raw = Math.abs(wheel[i].H - wheel[j].H);
        const gap = Math.min(raw, 360 - raw); /* the wheel wraps: 355° and 5° are 10 apart */
        if (gap >= HUE_FLOOR) continue;
        hits.push({
          token: `${wheel[i].name} ↔ ${wheel[j].name} (${label})`,
          why: `${wheel[i].H.toFixed(1)}° vs ${wheel[j].H.toFixed(1)}° — ${gap.toFixed(1)}° apart, under the ${HUE_FLOOR}° floor`,
          gap,
        });
      }
    }
  }
  hits.sort((a, b) => a.gap - b.gap); /* closest offending pair first */
  return {
    name: "hue-gap",
    rule: `the accent, the five division hues and the three status hues stay ≥${HUE_FLOOR}° apart (achromatic members excepted)`,
    total, hits, exempted,
  };
}

/* ── check: contrast ──────────────────────────────────────────────────────── */
/* --text-faint measured 2.96:1 on a paper card and 3.59:1 on ink, and it paints
   stat labels, ledger metadata and every empty state. It shipped that way in
   both themes for the whole life of the previous palette because nothing here
   could compute a ratio.

   GETTING THE THEME STRUCTURE RIGHT IS THE WHOLE CHECK. Several surfaces stay
   ink in BOTH themes — the member card, the Bridge, the kiosk, the toast — which
   is exactly why the --text-inverse-* and --line-inverse-* ramps exist and are
   deliberately NOT theme-flipped (compat.css §"Ink theme" states this at
   length). Evaluate ivory type against the PAPER ground because the paper theme
   is active and you get 1.04:1 on six tokens that are correct — a wall of false
   red, and the obvious way to silence it is to "fix" the ramps by flipping them,
   which breaks every fixed-ink surface in the product. So each entry below names
   the ground it actually renders on, and `groundTheme:"dark"` means "this ground
   is ink regardless of which theme is active". */

const AA_TEXT = 4.5;   /* §1.4.3 Contrast (Minimum), normal-weight body text */
const AA_NONTEXT = 3;  /* §1.4.11 Non-text Contrast — borders, rules, indicators */

const CONTRAST_SUBJECTS = [
  { /* The paper/ink text ramp. Both grounds, because a card is not the page:
       --text-faint clears AA on --surface-card and used to miss it on the page.
       --text-link and --text-gold are compat aliases onto --text-accent and so
       report the same ratio three times when it fails. That is deliberate: the
       three can be repointed independently, and a report that names only the
       canonical token leaves the reader to discover which call sites moved with
       it. --text-1/-2/-3 are omitted for the opposite reason — they are a
       straight one-to-one renaming of the ramp above with no separate future. */
    tokens: ["--text-body", "--text-muted", "--text-faint", "--text-accent", "--text-link", "--text-gold"],
    grounds: ["--surface-page", "--surface-card"], themes: ["root", "dark"], floor: AA_TEXT },
  { /* Knockout type on grounds that are ink in BOTH themes. See the block
       comment above and compat.css §"Ink theme" — flipping these with the theme
       paints the type the colour of the thing it sits on. */
    tokens: ["--text-inverse-1", "--text-inverse-2", "--text-inverse-3", "--paper", "--bone", "--sail"],
    grounds: ["--surface-page", "--surface-card"], groundTheme: "dark", themes: ["root", "dark"], floor: AA_TEXT },
  { /* The division's paper-safe step is small type on paper only; the ink-safe
       -lift step is small type on ink only. Checking either against the other's
       ground measures a pairing no surface ever renders. */
    tokens: ["--brand-scripted-deep", "--brand-limited-deep", "--brand-bound-deep", "--brand-cut-deep", "--brand-hinged-deep"],
    grounds: ["--surface-page", "--surface-card"], themes: ["root"], floor: AA_TEXT },
  { tokens: ["--brand-scripted-lift", "--brand-limited-lift", "--brand-bound-lift", "--brand-cut-lift", "--brand-hinged-lift"],
    grounds: ["--surface-page", "--surface-card"], themes: ["dark"], floor: AA_TEXT },
  { /* Type on a fill, where the ground is itself a token rather than a surface. */
    tokens: ["--on-accent"], grounds: ["--accent"], themes: ["root", "dark"], floor: AA_TEXT },
  { tokens: ["--action-on-primary"], grounds: ["--action-primary"], themes: ["root", "dark"], floor: AA_TEXT },
  { /* Non-text. Status does not only colour words — it draws the border of a
       held row, the inset rule under a caution banner and the progress track.
       §1.4.11 asks 3:1 of those, and the previous values missed it, which is why
       the palette moved them and said so. */
    tokens: ["--positive", "--caution", "--danger"],
    grounds: ["--surface-page", "--surface-card"], themes: ["root", "dark"], floor: AA_NONTEXT, kind: "border/rule" },
];

/* Text tokens whose ground is not a token and so has no computable ratio. Same
   spirit as ds-exempt and TOKEN_VOCABULARY: a documented decision, echoed in the
   report, never a silent skip. */
const CONTRAST_VOCABULARY = [
  { token: "--text-on-media",
    clause: "photography and the --scene-* gradients are the ground; a gradient has a different ratio at every pixel, so this is enforced by art direction and the protect scrim, not by a token pair" },
  { token: "--text-inverse",
    clause: "TOKEN_VOCABULARY: 'correct only on grounds that flip with the theme — every current ink ground is FIXED ink' — it has no consumer, so it has no ground to be measured against" },
];

function checkContrast() {
  const hits = [], exempted = CONTRAST_VOCABULARY.map((v) => ({ token: v.token, why: v.clause }));
  let total = 0;
  for (const spec of CONTRAST_SUBJECTS) {
    for (const theme of spec.themes) {
      const label = theme === "root" ? "paper" : "ink";
      for (const name of spec.tokens) {
        const fgRaw = COLORS.resolve(name, theme);
        if (!fgRaw) continue;
        for (const groundName of spec.grounds) {
          const bg = COLORS.resolve(groundName, spec.groundTheme ?? theme);
          if (!bg) continue;
          total++;
          const ratio = contrastRatio(over(fgRaw, bg), bg);
          if (ratio >= spec.floor) continue;
          const groundLabel = spec.groundTheme ? `${groundName} (always ink)` : groundName;
          hits.push({
            token: `${name} (${label})`,
            declaredAt: fgRaw.where,
            why: `${ratio.toFixed(2)}:1 on ${groundLabel} — below ${spec.floor}:1${spec.kind ? ` for ${spec.kind}` : ""}`,
          });
        }
      }
    }
  }
  return {
    name: "contrast",
    rule: `text clears ${AA_TEXT}:1 and status borders clear ${AA_NONTEXT}:1 against the ground each actually renders on`,
    total, hits, exempted,
  };
}

/* ── check: raw hex ───────────────────────────────────────────────────────── */
/* A hex typed into a surface is a colour that cannot be re-decided. Option C
   repointed the accent, five divisions and three status hues in one file and
   every var() consumer moved with it — every literal did not, and the literals
   are still wearing the retired acid green months after it was retired. A raw
   hex also cannot flip with the theme, so it is simultaneously the fastest way
   to ship ink type on an ink ground.

   tokens.css and palette.css are the two files whose JOB is to hold literals:
   one publishes the vocabulary, the other decides it. Everywhere else, a colour
   is a token reference.
   Comments are stripped before scanning, for the reason checkTokens gives: the
   radar and vetting stylesheets explain their history by quoting the hexes they
   used to contain, and a checker that fires on the explanation invites the fix
   of deleting the explanation. */

/* Files that render with no document and no cascade, where var() resolves to
   nothing and the surface comes out transparent-on-transparent. Written as a
   documented list in the same idiom as TOKEN_VOCABULARY rather than as
   ds-exempt comments, because the exemption is a property of HOW the file is
   rendered, not of any one line in it — and because each entry has to quote the
   clause that sanctions it. A per-line `ds-exempt: <reason>` still works here
   and is the right tool for a one-off. */
const RASTER_EXEMPT = [
  { match: /\/(opengraph-image|twitter-image|icon|apple-icon)\.tsx?$|\/og-frame\.tsx$/,
    clause: "next/og (satori) rasterises on the server with no document, so var(--noir-900) resolves to nothing and the card renders transparent-on-transparent — og-frame.tsx says so in its own header" },
  { match: /\/global-error\.tsx$/,
    clause: "the last net: a throw in the root layout itself, where no shell and no stylesheet is guaranteed — it carries its own html and body tags and therefore its own colours" },
];

/* CSS properties that take a colour, in JSX camelCase. An explicit list rather
   than "any key with a hex in it": `color:{dark:"#F1F1ED"}` is a qrcode option,
   `themeColor` is Next metadata for the browser chrome, and `ctx.strokeStyle`
   is the canvas API — none of the three is an inline style, none can read a
   custom property, and flagging them would be the check being wrong. */
const STYLE_COLOR_PROP =
  "(?:color|background|backgroundColor|backgroundImage|border(?:Top|Right|Bottom|Left|Inline|Block)?(?:Color)?|outline(?:Color)?|boxShadow|textShadow|textDecoration(?:Color)?|fill|stroke|caretColor|accentColor|columnRule(?:Color)?)";
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function checkNoRawHex() {
  const hits = [];
  let total = 0;
  const raster = (p) => RASTER_EXEMPT.find((r) => r.match.test(p));

  /* ── stylesheets ── */
  const srcCss = CSS.filter((p) => /\/src\//.test(p) && !/styles\/(tokens|palette)\.css$/.test(p));
  for (const p of srcCss) {
    const stripped = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    stripped.split("\n").forEach((line, i) => {
      const found = [...new Set([...line.matchAll(HEX)].map((m) => m[0]))];
      if (!found.length) return;
      total++;
      const why = exempt(lines(p)[i] ?? line);
      const sanctioned = raster(p);
      hits.push({
        file: rel(p), line: i + 1,
        exempt: why ?? (sanctioned ? sanctioned.clause : null),
        why: `${found.join(", ")} — raw hex outside tokens.css/palette.css`,
      });
    });
  }

  /* ── inline styles ──
     Two shapes, because og-frame.tsx uses the second: a hex written straight
     into a colour property, and a hex bound to a module constant that a colour
     property then reads. Flagging only the first would call that file clean. */
  const files = CODE.filter((p) => /\/src\//.test(p) && /\.tsx?$/.test(p));
  const DIRECT = new RegExp(`\\b${STYLE_COLOR_PROP}\\s*:\\s*("[^"]*"|'[^']*'|\`[^\`]*\`)`, "g");
  const BOUND = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*("[^"]*"|'[^']*'|`[^`]*`)/;
  for (const p of files) {
    const src = readFileSync(p, "utf8");
    const sanctioned = raster(p);
    lines(p).forEach((line, i) => {
      const found = new Set();
      for (const m of line.matchAll(DIRECT)) {
        for (const h of m[1].matchAll(HEX)) found.add(h[0]);
      }
      const bound = line.match(BOUND);
      if (bound && HEX.test(bound[2])) {
        HEX.lastIndex = 0;
        /* only when a colour property actually reads it — a hex in an unused or
           non-visual constant is not an inline style */
        if (new RegExp(`\\b${STYLE_COLOR_PROP}\\s*:\\s*${bound[1]}\\b`).test(src)) {
          for (const h of bound[2].matchAll(HEX)) found.add(h[0]);
        }
      }
      HEX.lastIndex = 0;
      if (!found.size) return;
      total++;
      const why = exempt(line);
      hits.push({
        file: rel(p), line: i + 1,
        exempt: why ?? (sanctioned ? sanctioned.clause : null),
        why: `${[...found].join(", ")} — raw hex in an inline style`,
      });
    });
  }

  return {
    name: "no-raw-hex",
    rule: "colour is a token reference: no hex literal outside tokens.css/palette.css, and none in a JSX style object",
    total,
    hits: hits.filter((h) => !h.exempt),
    exempted: hits.filter((h) => h.exempt),
  };
}

/* ── check: the founding year ─────────────────────────────────────────────── */
/* The club was founded in 2026 — MMXXVI — and brand.ts holds that in one
   constant. The offline page inside the service worker still read MMXXIV two
   rebrands later: it is a template literal in public/sw.js, so it imports
   nothing, no type checks it, and no page renders it until a member loses
   signal. Any other roman year written by hand is the same drift waiting to
   surface somewhere nobody looks. */

function checkFoundingYear() {
  const brand = readFileSync(join(ROOT, "src/lib/brand.ts"), "utf8");
  const truth = brand.match(/EST_YEAR_ROMAN\s*=\s*"([MDCLXVI]+)"/)?.[1];
  const hits = [];
  if (!truth) {
    hits.push({ file: rel(join(ROOT, "src/lib/brand.ts")), line: 0, why: "EST_YEAR_ROMAN not found" });
    return { name: "founding", rule: "every roman founding year matches EST_YEAR_ROMAN", hits, exempted: [] };
  }
  const files = CODE.concat(APP_CSS).filter((p) => !/\/brand\.ts$/.test(p));
  const exempted = [];
  for (const p of files) {
    lines(p).forEach((line, i) => {
      for (const m of line.matchAll(/\bEST\.?\s+(M[MDCLXVI]*)\b/gi)) {
        if (m[1].toUpperCase() === truth) continue;
        const why = exempt(line);
        const hit = { file: rel(p), line: i + 1, why: `reads ${m[1]}, brand says ${truth}` };
        if (why) exempted.push({ ...hit, declaredAt: why });
        else hits.push(hit);
      }
    });
  }
  return { name: "founding", rule: "every roman founding year matches EST_YEAR_ROMAN in brand.ts", hits, exempted };
}

/* ── report ───────────────────────────────────────────────────────────────── */

/* ── check: orphan classes ────────────────────────────────────────────────── */
/* A className whose rule does not LOAD where it is used. It is the failure
   mode with no symptom: nothing throws, nothing logs, the element simply
   renders with whatever the cascade happens to give it and the page looks like
   a spacing bug rather than a missing rule.

   It found the real thing, twice. The harbor→city rename updated the markup
   and left site.css behind, so .ws-city-row matched nothing — the home page's
   city rows had no grid, no gap and no alignment, and the status badge sat on
   top of the coordinates. The seven error and 404 pages asked for hm-btn, a
   class that has never existed in this repository, so every one of them
   rendered its only button as unstyled text.

   Then it missed one. src/app/(staff)/bridge/bridge.css defined .hm-channels,
   .hm-funnel, .hm-cam and thirty more, every one of them used by a Bridge
   screen — and nothing imported the file. The layout's `import "./bridge.css"`
   resolved to its sibling, src/app/(staff)/bridge.css. The check asked "does a
   rule exist in SOME stylesheet" and was satisfied; the Broadcast channels ran
   into each other for three weeks. So the question is now the right one: does
   a rule exist in a stylesheet that LOADS on every route that renders this
   file?

   Loading is read statically, the way Next resolves it. A route file
   (page/layout/template/error/not-found/loading/default) loads every stylesheet
   it imports, transitively through its components, plus every stylesheet its
   ancestor layouts import the same way — and a CSS @import chain (globals.css
   pulls in tokens, palette, fonts, compat, base, components) counts as one
   stylesheet. global-error renders in place of the root layout and so loads
   only its own imports. A file no route reaches (a script, a public/ asset)
   falls back to "any stylesheet" — the route model has nothing to say about
   it. And a stylesheet under src/ that nothing imports is a violation in its
   own right, because every rule in it is a dead rule.

   Only static, whole className strings are read. A composed name — "ls-tag--"
   plus a tone — is not knowable here and is not guessed at; the tone lists are
   short and their modifiers are covered by their own base class being present.
   Utility prefixes that belong to no stylesheet are exempted by name below. */

/* Classes handed out by something other than our CSS: framework hooks and the
   three state classes toggled from JS whose rules live in a media query we do
   parse — listed rather than pattern-matched so adding one is a decision. */
const CLASS_EXEMPT = new Set(["sr-only", "group", "dark", "light"]);

const ROUTE_FILE = /\/src\/app\/(?:.*\/)?(page|layout|template|error|not-found|loading|default|global-error)\.tsx?$/;
const SRC_CODE = CODE.filter((p) => p.startsWith(join(ROOT, "src") + "/"));
const SRC_CSS = CSS.filter((p) => p.startsWith(join(ROOT, "src") + "/"));
const EXISTS = new Set(ALL);

/* `./x`, `../x` and `@/x` (tsconfig paths: "@/*" → "./src/*"). A bare
   specifier is a package and is not ours to follow. Extensionless specifiers
   try the four source extensions and an index file, as the bundler does. */
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(from), spec);
  else if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
  else return null;
  if (EXISTS.has(base)) return base;
  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    if (EXISTS.has(base + ext)) return base + ext;
    if (EXISTS.has(join(base, "index" + ext))) return join(base, "index" + ext);
  }
  return null;
}

/* Static, re-exported and dynamic imports; the css `@import` on its own. */
const IMPORT_SPEC = /(?:^|\n)\s*(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+(?:\*|\{[^}]*\})\s+from\s+)["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const CSS_IMPORT = /@import\s+(?:url\()?["']([^"']+)["']/g;

function buildImportGraph() {
  const codeImports = new Map(); /* code file → [code files] */
  const cssImports = new Map();  /* code file → [css files] */
  const cssChain = new Map();    /* css file → [css files] */
  for (const p of SRC_CODE) {
    const text = readFileSync(p, "utf8");
    const code = [], css = [];
    for (const m of text.matchAll(IMPORT_SPEC)) {
      const target = resolveImport(p, m[1] ?? m[2]);
      if (!target) continue;
      (extname(target) === ".css" ? css : code).push(target);
    }
    codeImports.set(p, code);
    cssImports.set(p, css);
  }
  for (const p of SRC_CSS) {
    cssChain.set(p, [...readFileSync(p, "utf8").matchAll(CSS_IMPORT)]
      .map((m) => resolveImport(p, m[1])).filter(Boolean));
  }
  return { codeImports, cssImports, cssChain };
}

/* Everything reachable from `start` over `edges`, `start` included. */
function closure(start, edges) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const next of edges.get(stack.pop()) ?? []) {
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return seen;
}

function checkOrphanClasses() {
  const { codeImports, cssImports, cssChain } = buildImportGraph();

  /* stylesheet → the classes it (and its @import chain) defines */
  const definesIn = new Map();
  const definedAnywhere = new Set();
  for (const p of CSS) {
    const set = new Set();
    for (const m of readFileSync(p, "utf8").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) set.add(m[1]);
    definesIn.set(p, set);
    for (const c of set) definedAnywhere.add(c);
  }
  const cssReach = new Map(); /* code file → css files it loads, transitively */
  const loadsFrom = (p) => {
    if (!cssReach.has(p)) {
      const out = new Set();
      for (const f of closure(p, codeImports)) {
        for (const s of cssImports.get(f) ?? []) for (const c of closure(s, cssChain)) out.add(c);
      }
      cssReach.set(p, out);
    }
    return cssReach.get(p);
  };

  /* Each route file, and the stylesheets a render of it has on the page. */
  const APP = join(ROOT, "src/app");
  const entries = SRC_CODE.filter((p) => ROUTE_FILE.test(p));
  const cssOnRoute = new Map();
  for (const e of entries) {
    const loaded = new Set(loadsFrom(e));
    if (!/\/global-error\.tsx?$/.test(e)) {
      for (let dir = dirname(e); dir.length >= APP.length; dir = dirname(dir)) {
        for (const ext of [".tsx", ".ts"]) {
          const layout = join(dir, "layout" + ext);
          if (EXISTS.has(layout)) for (const c of loadsFrom(layout)) loaded.add(c);
        }
        if (dir === APP) break;
      }
    }
    cssOnRoute.set(e, loaded);
  }
  /* code file → the route files whose render reaches it */
  const routesOf = new Map();
  for (const e of entries) {
    for (const f of closure(e, codeImports)) {
      if (!routesOf.has(f)) routesOf.set(f, []);
      routesOf.get(f).push(e);
    }
  }
  const loadsOn = (route, cls) => {
    for (const s of cssOnRoute.get(route)) if (definesIn.get(s)?.has(cls)) return true;
    return false;
  };

  const hits = [];
  let total = 0;
  const seen = new Set();
  for (const p of CODE) {
    const routes = routesOf.get(p) ?? [];
    lines(p).forEach((line, i) => {
      /* The literal has to be the entire value. `className={"ls-rise-" + n}`
         is a composed name and the half before the plus is not a class —
         reading it as one reported .ls-rise- as missing. */
      for (const m of line.matchAll(/className=(?:"([^"{}]*)"|\{"([^"{}]*)"\})/g)) {
        const value = m[1] ?? m[2];
        for (const cls of value.trim().split(/\s+/)) {
          if (!cls || CLASS_EXEMPT.has(cls)) continue;
          total++;
          let why;
          if (!definedAnywhere.has(cls)) {
            /* One report per class. Seven files asking for the same missing
               class is one missing class, and listing it seven times buries
               the other six orphans under it. */
            if (seen.has(cls)) continue;
            seen.add(cls);
            why = `.${cls} — no CSS rule defines it`;
          } else {
            const bare = routes.filter((r) => !loadsOn(r, cls));
            if (!bare.length) continue;
            /* One report per class per file: it is this file, on these
               routes, that renders bare — the same class may be fine elsewhere. */
            if (seen.has(cls + "|" + p)) continue;
            seen.add(cls + "|" + p);
            const where = [...definesIn].filter(([, set]) => set.has(cls)).map(([s]) => rel(s));
            why = `.${cls} — defined in ${where.join(", ")}, which does not load on ${
              bare.length === 1 ? rel(bare[0]) : `${rel(bare[0])} (+${bare.length - 1} more route${bare.length > 2 ? "s" : ""})`}`;
          }
          const hit = { file: rel(p), line: i + 1, why };
          const reason = exempt(line);
          hits.push(reason ? { ...hit, exempt: reason } : hit);
        }
      }
    });
  }

  /* A stylesheet nothing imports. Its every rule is dead, and the class check
     above would still have counted them as "defined" — this is the file-level
     half of the same question. */
  const imported = new Set();
  for (const list of cssImports.values()) for (const s of list) imported.add(s);
  for (const list of cssChain.values()) for (const s of list) imported.add(s);
  for (const p of SRC_CSS) {
    total++;
    if (imported.has(p)) continue;
    const hit = { file: rel(p), line: 1, why: "no layout, page or component imports this stylesheet — none of its rules ever load" };
    const reason = exempt(lines(p)[0]);
    hits.push(reason ? { ...hit, exempt: reason } : hit);
  }

  return { name: "orphan-classes",
    rule: "every static className has a rule in a stylesheet that loads on every route rendering it, and every stylesheet under src/ is imported",
    total, hits: hits.filter((h) => !h.exempt), exempted: hits.filter((h) => h.exempt) };
}


/* ── check: icon names ────────────────────────────────────────────────────── */
/* §Iconography: "The system uses Lucide". Icon takes its name as a string and
   renders an EMPTY BOX of the requested size when Lucide has no such export —
   the layout holds, nothing throws, nothing logs, and the page looks like it
   has a gap rather than a bug. The agreements page asked for "FileSignature",
   which Lucide 1.x does not ship, and its empty state drew a blank 26px square
   above its title; an earlier pass found "Waves" doing the same.

   Every literal name is read against the set Lucide actually exports: the
   `name` prop on <Icon>, an `icon=` prop on any component (StateBlock and its
   kin forward it to Icon), and an `icon:` key in an object literal (the
   StateBlock defaults). A name that arrives through a variable is the
   caller's — a map keyed on a database column cannot be read here, which is
   why Icon also warns in development. */
import { createRequire } from "node:module";
const LUCIDE = new Set(Object.keys(createRequire(import.meta.url)("lucide-react").icons));
/* And the set the wrapper actually ships (src/components/ds/icon-set.ts): a
   real Lucide name that is not in the set still renders an empty box, because
   the bundle no longer carries the whole map. */
const ICON_SET = new Set(
  (readFileSync(join(ROOT, "src/components/ds/icon-set.ts"), "utf8").match(/export const ICONS = \{([\s\S]*?)\}/)?.[1] ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
);

function checkIcons() {
  const hits = [], exempted = [];
  let total = 0;
  const files = CODE.filter((p) => /\/src\//.test(p) && /\.tsx?$/.test(p));
  /* Two kinds of hit. A literal icon name (name=, icon=, icon:) must be a
     Lucide glyph AND in the shipped set. And ANY quoted PascalCase string that
     happens to be a Lucide name must be in the set too: the member tab bar
     passes "IdCard", "Bell" and "User" through a tuple the three patterns
     below could not see, and production drew three empty boxes for a day.
     A string that only looks like a glyph (a series called "Anchor") costs one
     extra glyph in the bundle, which is nothing beside a missing one. */
  const PATTERNS = [
    /<Icon\b[^>]*?\bname="([A-Za-z0-9]+)"/g,
    /\bicon=(?:"([A-Za-z0-9]+)"|\{"([A-Za-z0-9]+)"\})/g,
    /\bicon:\s*"([A-Za-z0-9]+)"/g,
    /"([A-Z][A-Za-z0-9]{2,})"/g,
  ];
  for (const p of files) {
    if (p.endsWith("icon-set.ts")) continue;
    lines(p).forEach((line, i) => {
      for (const re of PATTERNS) {
        for (const m of line.matchAll(re)) {
          const name = m[1] ?? m[2];
          if (!name) continue;
          const bare = re === PATTERNS[3];
          if (bare && !LUCIDE.has(name)) continue;
          total++;
          if (LUCIDE.has(name) && ICON_SET.has(name)) continue;
          const hit = {
            file: rel(p), line: i + 1,
            why: LUCIDE.has(name)
              ? `"${name}" is not in src/components/ds/icon-set.ts — add it, or Icon renders an empty box`
              : `"${name}" is not a Lucide icon — Icon renders an empty box`,
          };
          const why = exempt(line);
          if (why) exempted.push({ ...hit, exempt: why });
          else hits.push(hit);
        }
      }
    });
  }
  return { name: "icons", rule: `every literal icon name resolves in lucide-react and is carried by icon-set.ts (${ICON_SET.size} of ${LUCIDE.size} glyphs shipped)`, total, hits, exempted };
}

/* ── check: focus after all:unset ─────────────────────────────────────────── */
/* `all:unset` is how the kit strips a button back to text, and it strips the
   outline with it — base.css's global :focus-visible ring is (0,1,0), the same
   specificity as the class that unsets it, so whichever sheet loads later
   wins, and page sheets load later. Hail, Flag, Reply, Strike, Enter and
   Redeem all shipped with no keyboard focus indicator that way (WCAG 2.4.7)
   before .ls-bare got its own ring, and nothing was checking that the next
   `all:unset` remembered to.

   For every rule in the kit's own stylesheets that says all:unset, some rule
   must restate focus for the same selector — `S:focus-visible` or `S:focus`,
   or `S input:focus-visible+` for a control whose input is hidden behind a
   drawn box. A line may carry ds-exempt where the focus indication lives on a
   parent by design (the search slate's field row). Scoped to src/styles and
   src/components because that is the layer the kit owns; page sheets are
   their owners' — .gw-mono in gangway.css is the one known outside it. */
function checkUnsetFocus() {
  const hits = [], exempted = [];
  let total = 0;
  const sheets = APP_CSS.filter((p) => /\/src\/(styles|components)\//.test(p));
  /* selector → true for every rule anywhere in the layer that mentions focus */
  const focused = [];
  for (const p of sheets) {
    const src = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    for (const m of src.matchAll(/([^{}@]+)\{[^{}]*\}/g)) {
      for (const sel of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        if (/:focus/.test(sel)) focused.push(sel);
      }
    }
  }
  const hasFocus = (sel) => {
    const base = sel.replace(/\s+/g, " ");
    return focused.some((f) => {
      const g = f.replace(/\s+/g, " ");
      return g.startsWith(base + ":focus") || g.startsWith(base + " input:focus") || g.startsWith(base + " :focus");
    });
  };
  for (const p of sheets) {
    lines(p).forEach((line, i) => {
      if (!/all:\s*unset/.test(line)) return;
      const why = exempt(line);
      for (const m of line.matchAll(/([^{}@;]+)\{[^{}]*all:\s*unset[^{}]*\}/g)) {
        for (const sel of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          total++;
          if (hasFocus(sel)) continue;
          const hit = { file: rel(p), line: i + 1, why: `${sel} sets all:unset and no rule restates :focus-visible for it` };
          if (why) exempted.push({ ...hit, exempt: why });
          else hits.push(hit);
        }
      }
    });
  }
  return { name: "unset-focus", rule: "every all:unset selector in the kit's stylesheets has a :focus-visible rule of its own", total, hits, exempted };
}

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const checks = [checkWeights(), checkScale(), ...checkDisplay(), checkMotion(), checkTokens(), checkVocab(), checkFoundingYear(), checkInline(), checkTracking(),
                checkHueArc(), checkHueGap(), checkContrast(), checkNoRawHex(), checkOrphanClasses(), checkIcons(), checkUnsetFocus()]
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
