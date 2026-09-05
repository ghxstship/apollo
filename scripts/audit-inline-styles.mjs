#!/usr/bin/env node
/* [un] inline-style gate — the second half of "component-driven".

   audit-design-system.mjs reads the VALUES inside a React `style={{…}}`
   object (off-ladder sizes, unloaded weights, raw hex, off-token tracking).
   It says nothing about whether the object should exist at all. This gate
   reads the SHAPE: a static object that only lays boxes out is a stylesheet
   class written in the wrong place, and a literal `marginTop: 14` is a
   spacing decision the token file never made.

   Every `style={{…}}` in src/app and src/components (the kit under
   src/components/ds is the design system's own implementation and is not
   app usage) is classified as one of:

     dynamic          carries a runtime value — a width from data, a colour
                      from a prop. The one thing inline style is FOR. Passes.
     token-drift      a literal that should be a token: px spacing not from
                      var(--space-*), a font-size literal, a colour literal,
                      a ms duration or bezier, a radius literal. Fails.
     layout-duplicate a static object of only display/flex/grid/gap/margin/
                      padding/align/justify keys — a class that a route-group
                      sheet already provides or should. Fails.
     one-off          static, not layout-only, no drift. Passes here and is
                      listed under --inventory so the report can judge it.

   A literal hex colour is left to check:ds (no-raw-hex) so one drift is one
   violation; it is still classified as token-drift in the inventory, marked
   owner "check:ds", and does not fail this gate.

   Run:  node scripts/audit-inline-styles.mjs [--json] [--inventory]
   Exit: 0 when both checks are clean, 1 otherwise.

   Suppression: `style-exempt: <reason>` in a comment inside the object, on
   the `style={{` line, or on the line above it. The reason is required and is
   echoed in the report. File-level exemptions (next/og rasterisation, the
   root global-error) are the same RASTER_EXEMPT table check:ds uses, quoted
   here so the two gates agree on what has no cascade to lean on. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/* ── the published values, read from tokens.css rather than retyped ──────── */

const tokensCss = readFileSync(join(ROOT, "src/styles/tokens.css"), "utf8");
const tokenMap = (re) => {
  const out = new Map();
  for (const m of tokensCss.matchAll(re)) out.set(Number(m[2]), m[1]);
  return out;
};
/* px → token name */
export const SPACE = tokenMap(/(--space-\d+):\s*(\d+)px/g);
export const TEXT = tokenMap(/(--text-[0-9a-z]+):\s*(\d+)px/g);
export const RADIUS = tokenMap(/(--radius-[a-z]+):\s*(\d+)px/g);
export const DUR = tokenMap(/(--dur-[a-z]+):\s*(\d+)ms/g);
const EASE = new Map(
  [...tokensCss.matchAll(/(--ease-[a-z]+):\s*(cubic-bezier\([^)]*\))/g)].map((m) => [m[2].replace(/\s/g, ""), m[1]])
);
const RHYTHM = 4;

/* ── file collection ──────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = (p) => relative(ROOT, p);
const TSX = [...walk(join(ROOT, "src/app")), ...walk(join(ROOT, "src/components"))]
  .filter((p) => extname(p) === ".tsx" && !p.startsWith(join(ROOT, "src/components/ds") + "/"));

/* Same table as audit-design-system.mjs. next/og renders with no document, so
   there is no stylesheet for a class to live in; global-error renders in place
   of the root layout with no shell guaranteed. Inline style is the only
   mechanism either has. */
const RASTER_EXEMPT = [
  { match: /\/(opengraph-image|twitter-image|icon|apple-icon)\.tsx?$|\/og-frame\.tsx$/,
    clause: "next/og (satori) rasterises on the server with no document and no stylesheet — inline style is the only mechanism" },
  { match: /\/global-error\.tsx$/,
    clause: "the last net: a throw in the root layout itself, where no shell and no stylesheet is guaranteed" },
];

/* ── route groups: where a class would live ───────────────────────────────── */

const AREAS = [
  { test: /\/src\/app\/\(member\)\//, area: "member", sheet: "src/app/(member)/member.css", prefix: "mbr" },
  { test: /\/src\/app\/\(staff\)\//, area: "staff", sheet: "src/app/(staff)/bridge.css", prefix: "hm" },
  { test: /\/src\/app\/\(site\)\/|\/src\/components\/site\//, area: "site", sheet: "src/components/site/site.css", prefix: "ws" },
  { test: /\/src\/app\/gangway\//, area: "gangway", sheet: "src/app/gangway/gangway.css", prefix: "gw" },
  { test: /\/src\/app\/sign\//, area: "sign", sheet: "src/app/sign/sign.css", prefix: "gsn" },
  { test: /\/src\/app\/kiosk\//, area: "kiosk", sheet: "src/app/kiosk/kiosk.css", prefix: "kio" },
  { test: /\/src\/app\/preview\//, area: "preview", sheet: "src/app/preview/documents/preview.css", prefix: "pv" },
  { test: /\/src\/components\/member\//, area: "member", sheet: "src/app/(member)/member.css", prefix: "mbr" },
  { test: /\/src\/components\/producer\//, area: "staff", sheet: "src/components/producer/producer.css", prefix: "pp" },
  { test: /\/src\/components\//, area: "shared", sheet: "src/styles/components.css", prefix: "ls" },
  { test: /\/src\/app\//, area: "root", sheet: "src/styles/components.css", prefix: "ls" },
];
export const areaOf = (p) => AREAS.find((a) => a.test.test(p)) ?? AREAS.at(-1);

/* ── key vocabulary ───────────────────────────────────────────────────────── */

const LAYOUT_KEYS = new Set([
  "display", "flex", "flexDirection", "flexWrap", "flexGrow", "flexShrink", "flexBasis", "flexFlow", "order",
  "gap", "rowGap", "columnGap",
  "gridTemplateColumns", "gridTemplateRows", "gridTemplateAreas", "gridColumn", "gridRow", "gridArea",
  "gridAutoFlow", "gridAutoRows", "gridAutoColumns",
  "placeItems", "placeContent", "placeSelf", "alignItems", "alignSelf", "alignContent",
  "justifyContent", "justifyItems", "justifySelf",
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft", "marginInline", "marginBlock",
  "marginInlineStart", "marginInlineEnd", "marginBlockStart", "marginBlockEnd",
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "paddingInline", "paddingBlock",
  "paddingInlineStart", "paddingInlineEnd", "paddingBlockStart", "paddingBlockEnd",
]);
const SPACING_KEYS = new Set(
  [...LAYOUT_KEYS].filter((k) => /^(gap|rowGap|columnGap|margin|padding)/.test(k)).concat(["inset"])
);
const COLOR_KEYS = new Set([
  "color", "background", "backgroundColor", "backgroundImage", "border", "borderTop", "borderRight", "borderBottom",
  "borderLeft", "borderInline", "borderBlock", "borderColor", "borderTopColor", "borderRightColor", "borderBottomColor",
  "borderLeftColor", "outline", "outlineColor", "boxShadow", "textShadow", "textDecoration", "textDecorationColor",
  "fill", "stroke", "caretColor", "accentColor", "columnRule", "columnRuleColor",
]);
const DURATION_KEYS = new Set(["transition", "transitionDuration", "transitionDelay", "transitionTimingFunction",
  "animation", "animationDuration", "animationDelay", "animationTimingFunction"]);
const RADIUS_KEYS = new Set(["borderRadius", "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomLeftRadius", "borderBottomRightRadius", "borderStartStartRadius", "borderStartEndRadius",
  "borderEndStartRadius", "borderEndEndRadius"]);

/* CSS named colours a literal could be hiding behind. transparent, inherit,
   currentColor and none are not colours a token would replace. */
const NAMED_COLOR = /\b(white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|silver|gold|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|ivory|beige|crimson|coral|salmon|tomato|khaki|indigo|violet|plum|orchid|tan|wheat|linen|snow|azure|lavender|mintcream|whitesmoke|gainsboro|dimgray|dimgrey|darkgray|darkgrey|lightgray|lightgrey)\b/i;

/* ── the object extractor ─────────────────────────────────────────────────── */

/* Walks from the opening `{` of `style={{` to its matching brace, skipping
   strings, template literals and comments, so a `}` inside "grid }" or a
   `${x}` never ends the object early. Returns [innerText, endIndex]. */
function balanced(src, open) {
  let depth = 0, i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i, c); continue; }
    if (c === "`") { i = skipTemplate(src, i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2) + 2; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); if (i < 0) i = src.length; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") { depth--; if (depth === 0) return [src.slice(open + 1, i), i]; }
    i++;
  }
  return [src.slice(open + 1), src.length];
}
function skipString(src, i, q) {
  i++;
  while (i < src.length && src[i] !== q) { if (src[i] === "\\") i++; i++; }
  return i + 1;
}
function skipTemplate(src, i) {
  i++;
  while (i < src.length && src[i] !== "`") {
    if (src[i] === "\\") { i += 2; continue; }
    if (src[i] === "$" && src[i + 1] === "{") { i = balanced(src, i + 1)[1] + 1; continue; }
    i++;
  }
  return i + 1;
}

/* Depth-0 comma split with the same string/template awareness. */
function splitEntries(inner) {
  const out = [];
  let depth = 0, start = 0, i = 0;
  while (i < inner.length) {
    const c = inner[i];
    if (c === '"' || c === "'") { i = skipString(inner, i, c); continue; }
    if (c === "`") { i = skipTemplate(inner, i); continue; }
    if (c === "/" && inner[i + 1] === "*") { i = inner.indexOf("*/", i + 2) + 2; continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === "," && depth === 0) { out.push(inner.slice(start, i)); start = i + 1; }
    i++;
  }
  out.push(inner.slice(start));
  return out.map((s) => s.replace(/\/\*[\s\S]*?\*\//g, "").trim()).filter(Boolean);
}

const STATIC_VALUE = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`$]*`|-?\d+(?:\.\d+)?)$/;
const unquote = (v) => v.replace(/^["'`]|["'`]$/g, "");

function parseEntries(inner) {
  return splitEntries(inner).map((entry) => {
    if (entry.startsWith("...")) return { key: entry, kind: "spread", dynamic: true, raw: entry };
    const colon = topLevelColon(entry);
    if (colon < 0) return { key: entry, kind: "shorthand", dynamic: true, raw: entry };
    let key = entry.slice(0, colon).trim();
    const raw = entry.slice(colon + 1).trim();
    let kind = "prop";
    if (/^\[/.test(key)) kind = "computed";
    else if (/^["']--/.test(key)) { kind = "custom"; key = unquote(key); }
    else key = unquote(key);
    const dynamic = kind === "computed" || !STATIC_VALUE.test(raw);
    return { key, kind, dynamic, raw, literal: dynamic ? null : (/^-?\d/.test(raw) ? Number(raw) : unquote(raw)) };
  });
}
function topLevelColon(s) {
  let depth = 0, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipString(s, i, c); continue; }
    if (c === "`") { i = skipTemplate(s, i); continue; }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (c === ":" && depth === 0) return i;
    i++;
  }
  return -1;
}

/* ── drift rules on literal values ────────────────────────────────────────── */

const nearest = (map, n) => [...map.keys()].reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));

function driftOf(e) {
  const { key, literal } = e;
  if (literal === null || literal === undefined) return null;
  const s = String(literal).trim();

  if (SPACING_KEYS.has(key)) {
    /* every whitespace-separated term of a shorthand; 0 and auto are not
       spacing decisions, and % / em / ch / var() are not px literals */
    const px = s.split(/\s+/)
      .map((t) => t.match(/^(-?\d+(?:\.\d+)?)(?:px)?$/))
      .filter(Boolean).map((m) => Math.abs(Number(m[1]))).filter((n) => n !== 0);
    if (!px.length) return null;
    const proposal = px.map((n) => SPACE.has(n) ? `var(${SPACE.get(n)})`
      : `${n}px is ${n % RHYTHM ? "off the 4px rhythm" : "on rhythm but has no --space token"}; nearest var(${SPACE.get(nearest(SPACE, n))})`);
    return { rule: "spacing", values: px, proposal: proposal.join(" · "), owner: "inline-styles" };
  }
  if (key === "fontSize") {
    const m = s.match(/^(\d+(?:\.\d+)?)(?:px)?$/);
    if (!m) return null;
    const n = Number(m[1]);
    return { rule: "font-size", values: [n], owner: "inline-styles",
      proposal: TEXT.has(n) ? `var(${TEXT.get(n)})` : `${n}px is off the ladder (check:ds flags it too); nearest var(${TEXT.get(nearest(TEXT, n))})` };
  }
  if (COLOR_KEYS.has(key)) {
    if (/#[0-9a-fA-F]{3,8}\b/.test(s)) return { rule: "colour", values: [s], proposal: "a palette/semantic token", owner: "check:ds" };
    /* a var() reference is the token — `var(--gold-deep)` is not the colour gold */
    const bare = s.replace(/var\([^)]*\)/g, "");
    if (/\b(?:rgba?|hsla?|oklch|color-mix)\(/.test(bare) || NAMED_COLOR.test(bare)) {
      return { rule: "colour", values: [s], proposal: "a palette/semantic token (--border-subtle, --surface-*, --text-*)", owner: "inline-styles" };
    }
    return null;
  }
  if (DURATION_KEYS.has(key)) {
    const out = [];
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)) {
      const ms = m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]);
      out.push(DUR.has(ms) ? `var(${DUR.get(ms)})` : `${ms}ms has no --dur token; nearest var(${DUR.get(nearest(DUR, ms))})`);
    }
    for (const m of s.matchAll(/cubic-bezier\([^)]*\)/g)) {
      const k = m[0].replace(/\s/g, "");
      out.push(EASE.has(k) ? `var(${EASE.get(k)})` : `${m[0]} has no --ease token`);
    }
    if (/\b(ease|ease-in|ease-out|ease-in-out|linear)\b/.test(s)) out.push("keyword easing; use var(--ease-out) or var(--ease-inout)");
    return out.length ? { rule: "motion", values: [s], proposal: out.join(" · "), owner: "inline-styles" } : null;
  }
  if (RADIUS_KEYS.has(key)) {
    const px = s.split(/\s+/).map((t) => t.match(/^(\d+(?:\.\d+)?)(?:px)?$/)).filter(Boolean).map((m) => Number(m[1]));
    if (!px.length) return null;
    return { rule: "radius", values: px, owner: "inline-styles",
      proposal: px.map((n) => RADIUS.has(n) ? `var(${RADIUS.get(n)})` : n >= 999 ? "var(--radius-pill)" : `${n}px has no --radius token; nearest var(${RADIUS.get(nearest(RADIUS, n))})`).join(" · ") };
  }
  return null;
}

/* ── the classifier ───────────────────────────────────────────────────────── */

const EXEMPT = /style-exempt:\s*([^*\n]+?)\s*(?:\*\/|$)/;

export function classify(entries) {
  const drift = entries.map((e) => ({ e, d: e.dynamic ? null : driftOf(e) })).filter((x) => x.d);
  const gated = drift.filter((x) => x.d.owner === "inline-styles");
  const allStatic = entries.every((e) => !e.dynamic);
  const layoutOnly = allStatic && entries.length > 0 && entries.every((e) => e.kind === "prop" && LAYOUT_KEYS.has(e.key));
  let cls;
  if (gated.length) cls = "token-drift";
  else if (!allStatic) cls = drift.length ? "token-drift" : "dynamic";
  else if (drift.length) cls = "token-drift";
  else if (layoutOnly) cls = "layout-duplicate";
  else cls = "one-off";
  return { cls, drift: drift.map((x) => ({ key: x.e.key, ...x.d })), layoutOnly, allStatic };
}

/* Every style object in the app, classified. */
export function inventory() {
  const items = [];
  for (const p of TSX) {
    const src = readFileSync(p, "utf8");
    const srcLines = src.split("\n");
    const raster = RASTER_EXEMPT.find((r) => r.match.test(p));
    for (const m of src.matchAll(/style=\{\{/g)) {
      const open = m.index + "style={".length;
      const [inner] = balanced(src, open);
      const line = src.slice(0, m.index).split("\n").length;
      const entries = parseEntries(inner);
      const { cls, drift, layoutOnly, allStatic } = classify(entries);
      const why = (inner.match(EXEMPT) ?? srcLines[line - 1].match(EXEMPT) ?? (srcLines[line - 2] ?? "").match(EXEMPT))?.[1]
        ?? (raster ? raster.clause : null);
      items.push({
        file: rel(p), line, area: areaOf(p).area, sheet: areaOf(p).sheet, prefix: areaOf(p).prefix,
        cls, keys: entries.map((e) => e.key), allStatic, layoutOnly,
        static: entries.filter((e) => !e.dynamic).map((e) => [e.key, e.literal]),
        drift, exempt: why,
        text: inner.replace(/\s+/g, " ").trim().slice(0, 160),
      });
    }
  }
  return items;
}

/* ── checks ───────────────────────────────────────────────────────────────── */

function checks(items) {
  const layout = items.filter((i) => i.cls === "layout-duplicate");
  const drift = items.filter((i) => i.drift.some((d) => d.owner === "inline-styles"));
  const split = (arr) => ({ hits: arr.filter((h) => !h.exempt), exempted: arr.filter((h) => h.exempt) });
  return [
    { name: "layout-duplicate", total: items.length,
      rule: "a static style object of only display/flex/grid/gap/margin/padding/align/justify keys is a class in the route-group sheet, not a prop",
      ...split(layout) },
    { name: "token-drift", total: items.length,
      rule: "px spacing is var(--space-*), font sizes var(--text-*), durations var(--dur-*), radii var(--radius-*), colours a token — no literals in a style object",
      ...split(drift) },
  ];
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const items = inventory();
  const result = checks(items);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(process.argv.includes("--inventory") ? { checks: result, inventory: items } : result, null, 2));
  } else {
    let failed = 0;
    for (const c of result) {
      const n = c.hits.length;
      if (n) failed++;
      console.log(`\n${n ? "FAIL" : "ok  "}  ${c.name.padEnd(17)} ${n} violation${n === 1 ? "" : "s"} (of ${c.total} style objects)` +
        (c.exempted.length ? `, ${c.exempted.length} exempted` : ""));
      console.log(`        ${c.rule}`);
      for (const h of c.hits.slice(0, 40)) {
        const detail = h.drift.filter((d) => d.owner === "inline-styles").map((d) => `${d.key} → ${d.proposal}`).join("; ");
        console.log(`        · ${h.file}:${h.line} — {${h.keys.join(", ")}}${detail ? ` — ${detail}` : ""}`);
      }
      if (c.hits.length > 40) console.log(`        … and ${c.hits.length - 40} more`);
    }
    if (process.argv.includes("--inventory")) {
      const by = {};
      for (const i of items) by[i.cls] = (by[i.cls] ?? 0) + 1;
      console.log(`\ninventory: ${items.length} style objects — ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
    console.log(`\n${failed ? `${failed} check(s) failing` : "all checks clean"}`);
    process.exit(failed ? 1 : 0);
  }
}
