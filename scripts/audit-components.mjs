#!/usr/bin/env node
/* [un] component-conformance gate.

   The design system in src/components/ds is the only place a button, a field,
   a badge, a table or a dialog is drawn. Everything else RENDERS THROUGH those
   components — a hand-rolled `<button className="ls-btn">` is the same pixels
   today and a fork tomorrow, when Button learns a prop and the copy does not.

   Two rules, both static, both cheap (no bundler, no TypeScript):

   raw-elements   No `<button> <input> <select> <textarea> <table> <dialog>
                  <progress>` in a .tsx outside ds/. The DS ships Button,
                  IconButton, Input, Select, Textarea, Checkbox, Radio, Switch,
                  Table, Dialog and Progress for exactly these.
                  `<input type="hidden">` is exempted by construction — it draws
                  nothing and carries form data; there is no component to reach
                  for — and is counted as exempted, not skipped.

   ds-classes     No design-system class string (ls-btn, ls-badge, ls-field,
                  ls-check, ls-table, ls-tabs, ls-dialog, ls-toast, and the
                  rest of the component vocabulary in DS_FAMILIES) written
                  directly in a .tsx outside ds/. One exception by construction:
                  `ls-bare`, the DS's own reset for text-like buttons
                  (components.css ".ls-bare"); TextButton is the component to
                  reach for, but the reset itself stays legal. LinkButton moved
                  into ds/ (actions.tsx) and src/components/site/link-button.tsx
                  is a re-export shim, so the file-level exception it used to
                  need is gone.
                  Layout and text utilities (ls-container, ls-section, ls-grid-*,
                  ls-choices, ls-note, ls-stack, ls-acts, ls-visually-hidden, …)
                  are not component classes and are not in scope.

   Suppression: `ds-exempt: <reason>` in a comment on the same line or the line
   above sanctions a hit. The reason is required and is echoed in the report,
   so an exemption is a documented decision rather than a silent one:

     <table>  // ds-exempt: print-only door list; Table's scroll wrapper is a screen affordance

   or, in JSX, a brace-wrapped block comment on the line above the element:

     {  ds-exempt: print-only door list; Table's scroll wrapper is a screen affordance  }
     <table>

   (written here without the comment delimiters so it does not close this one).

   Run:  node scripts/audit-components.mjs [--json] [--only=raw-elements,ds-classes]
   Exit: 0 when every enabled check is clean, 1 otherwise.

   Companion to scripts/audit-design-system.mjs, which checks the CSS and the
   values; this one checks that the app reaches the CSS through the components. */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const DS_DIR = join(ROOT, "src/components/ds") + "/";

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

const FILES = [...walk(join(ROOT, "src/app")), ...walk(join(ROOT, "src/components"))]
  .filter((p) => p.endsWith(".tsx") && !p.startsWith(DS_DIR))
  .sort();

const rel = (p) => relative(ROOT, p);

/* Which part of the product a file belongs to — the report totals by this. */
function areaOf(p) {
  const r = rel(p);
  if (r.startsWith("src/app/(site)/")) return "site";
  if (r.startsWith("src/app/(member)/")) return "member";
  if (r.startsWith("src/app/(staff)/")) return "staff";
  if (/^src\/app\/(gangway|sign|auth|w)\//.test(r)) return "gangway-sign-auth";
  if (r.startsWith("src/components/")) return "components";
  return "app-root";
}

/* ── comment stripping ────────────────────────────────────────────────────── */
/* A `<input type="datetime-local">` quoted inside a block comment is prose,
   not a render. Comments are blanked to spaces (newlines kept) so line numbers
   survive, and the RAW lines are kept alongside for the ds-exempt lookup,
   which lives in exactly the comments this removes. */
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let quote = null; /* ' " ` while inside a string literal */
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") { out += d ?? ""; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    /* A line comment only when `//` opens a statement — after whitespace at
       the line start or after an operator/brace. `href="https://…"` is inside
       a string and never reaches here; `a // b` in code is rare enough in TSX
       that the whitespace rule covers it. */
    const prev = out.slice(-1);
    if (c === "/" && d === "/" && (prev === "" || /[\s{(,;=]/.test(prev))) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

const exemptOn = (line) => {
  const m = line.match(/ds-exempt:\s*([^*]+?)\s*(?:\*\/|$)/);
  return m ? m[1].trim() : null;
};

/* Same line first, then the line above — a JSX comment sits on its own line. */
function exemptFor(rawLines, i) {
  return exemptOn(rawLines[i]) ?? (i > 0 ? exemptOn(rawLines[i - 1]) : null);
}

const SOURCES = FILES.map((p) => {
  const src = readFileSync(p, "utf8");
  return { p, raw: src.split("\n"), clean: stripComments(src).split("\n") };
});

/* ── check: raw elements ──────────────────────────────────────────────────── */

/* `$` because a multi-line opening tag ends its first line right after the
   element name — `<button` and then the attributes — and the lines are
   already split when this runs. */
const RAW = /<(button|input|select|textarea|table|dialog|progress)(?=[\s/>]|$)/g;

/* What the DS offers in place of each element — for the hint column. */
const REPLACES = {
  button: "Button / IconButton (text-like: ls-bare)",
  input: "Input / Checkbox / Radio / Switch",
  select: "Select",
  textarea: "Textarea (feed: Composer)",
  table: "Table",
  dialog: "Dialog",
  progress: "Progress",
};

function checkRawElements() {
  const hits = [], exempted = [];
  let total = 0;
  for (const { p, raw, clean } of SOURCES) {
    clean.forEach((line, i) => {
      for (const m of line.matchAll(RAW)) {
        total++;
        const el = m[1];
        const tag = line.slice(m.index);
        const hit = { file: rel(p), line: i + 1, area: areaOf(p), what: `<${el}>`, hint: REPLACES[el], text: raw[i].trim().slice(0, 120) };
        /* Nothing is drawn; there is no component to reach for. Counted,
           not skipped. */
        if (el === "input" && /^<input\b[^>]*\btype="hidden"/.test(tag)) {
          exempted.push({ ...hit, exempt: "input[type=hidden] carries form data and draws nothing (by construction)" });
          continue;
        }
        const why = exemptFor(raw, i);
        if (why) exempted.push({ ...hit, exempt: why });
        else hits.push(hit);
      }
    });
  }
  return {
    name: "raw-elements",
    rule: "no raw <button|input|select|textarea|table|dialog|progress> in src/app or src/components outside ds/ — render through the DS component, or carry `ds-exempt: <reason>`",
    total, hits, exempted,
  };
}

/* ── check: DS class strings ──────────────────────────────────────────────── */
/* The component vocabulary of src/styles/components.css. A modifier or an
   element of one of these (ls-btn--gold, ls-table-wrap, ls-progress--danger)
   is the same family. */
const DS_FAMILIES = [
  "btn", "iconbtn", "textbtn", "themetog",
  "card", "badge", "tag", "avatar", "avatar-group", "stat", "table", "review", "wm",
  "field", "input", "input-wrap", "textarea", "select", "select-wrap", "searchfield", "check", "radio", "option", "switch", "stepper", "writein",
  "dialog", "dialog-veil", "progress", "state", "notice", "toast", "tip",
  "filters", "toolbar", "pop", "filterpanel", "sortmenu", "tabs", "tab",
];

/* Sanctioned by construction — reset and layout utilities with no component
   wrapper. Listed so the boundary is written down, not implied by absence. */
const DS_UTILITIES = [
  "bare", "choices", "note", "container", "section", "grid-2", "grid-3", "grid-4", "double-rule",
  "visually-hidden", "mono-data", "mono", "eyebrow", "lede", "acts", "panel", "stack", "inline", "empty",
  "fade", "rise", "live", "skip", "announcer", "announcer-alert",
];

const FAMILY_RE = new RegExp(
  `\\bls-(${DS_FAMILIES.join("|")})(?=$|[\\s"'\`}]|--|__)`,
  "g"
);

/* Which component owns the class, for the hint column. */
function componentFor(cls) {
  const fam = cls.replace(/^ls-/, "").replace(/(--|__).*$/, "");
  const map = {
    btn: "Button / LinkButton", iconbtn: "IconButton", textbtn: "TextButton", themetog: "ThemeToggle",
    card: "Card", badge: "Badge", tag: "Tag", avatar: "Avatar", "avatar-group": "AvatarGroup", stat: "Stat",
    table: "Table", review: "ReviewList / ReviewRow", wm: "Wordmark",
    field: "Input / Select / Textarea", input: "Input", "input-wrap": "Input (adornEnd)", textarea: "Textarea", select: "Select", "select-wrap": "Select",
    searchfield: "SearchField", check: "Checkbox", radio: "Radio", option: "OptionRow (or Radio/Checkbox boxed)", switch: "Switch", stepper: "Stepper", writein: "Composer / Textarea",
    dialog: "Dialog", "dialog-veil": "Dialog", progress: "Progress (tone prop)", state: "StateBlock", notice: "Notice", toast: "Toast", tip: "Tooltip",
    filters: "FilterPills", toolbar: "ListToolbar", pop: "ListToolbar", filterpanel: "ListToolbar", sortmenu: "ListToolbar",
    tabs: "Tabs", tab: "Tabs",
  };
  return map[fam] ?? fam;
}

function checkDsClasses() {
  const hits = [], exempted = [];
  let total = 0;
  for (const { p, raw, clean } of SOURCES) {
    clean.forEach((line, i) => {
      const found = [...line.matchAll(FAMILY_RE)];
      if (!found.length) return;
      total++;
      /* One hit per line, naming every family on it. */
      const classes = [...new Set(found.map((m) => {
        const rest = line.slice(m.index + m[0].length).match(/^(?:--|__)[a-z0-9-]+/);
        return m[0] + (rest ? rest[0] : "");
      }))];
      const hit = {
        file: rel(p), line: i + 1, area: areaOf(p),
        what: classes.join(" "),
        hint: [...new Set(classes.map(componentFor))].join(", "),
        text: raw[i].trim().slice(0, 120),
      };
      const why = exemptFor(raw, i);
      if (why) exempted.push({ ...hit, exempt: why });
      else hits.push(hit);
    });
  }
  return {
    name: "ds-classes",
    rule: `no DS component class (ls-${DS_FAMILIES.slice(0, 8).join(", ls-")}, …) written directly outside ds/ — use the component; ls-${DS_UTILITIES.slice(0, 3).join(", ls-")}… utilities are outside the rule`,
    total, hits, exempted,
  };
}

/* ── report ───────────────────────────────────────────────────────────────── */

const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const checks = [checkRawElements(), checkDsClasses()].filter((c) => !only || only.includes(c.name));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ files: FILES.length, checks }, null, 2));
} else {
  let failed = 0;
  console.log(`${FILES.length} .tsx files under src/app and src/components (ds/ excluded)`);
  for (const c of checks) {
    const n = c.hits.length;
    if (n) failed++;
    const byArea = {};
    for (const h of c.hits) byArea[h.area] = (byArea[h.area] ?? 0) + 1;
    const areas = Object.entries(byArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ");
    console.log(`\n${n ? "FAIL" : "ok  "}  ${c.name.padEnd(14)} ${n} violation${n === 1 ? "" : "s"} (of ${c.total} checked)` +
      (c.exempted.length ? `, ${c.exempted.length} exempted` : "") + (areas ? `  [${areas}]` : ""));
    console.log(`        ${c.rule}`);
    for (const h of c.hits.slice(0, 60)) {
      console.log(`        · ${h.file}:${h.line} — ${h.what} → ${h.hint}`);
    }
    if (c.hits.length > 60) console.log(`        … and ${c.hits.length - 60} more`);
  }
  console.log(`\n${failed ? `${failed} check(s) failing` : "all checks clean"}`);
  process.exit(failed ? 1 : 0);
}
