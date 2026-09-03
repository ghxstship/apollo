#!/usr/bin/env node
/**
 * Route manifest generator — the single source of truth for "what routes exist".
 *
 * Scans src/app for page.tsx and route.ts files and writes
 * src/lib/route-manifest.json. Runs automatically before `dev` and `build`
 * (see package.json), so the manifest can never drift from the filesystem.
 * Consumed by src/app/sitemap.ts (public sitemap) and scripts/audit-routes.mjs
 * (route health audit).
 *
 * Deterministic output: sorted, no timestamps — regenerating with no route
 * changes produces no git diff.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appDir = join(root, "src", "app");
const outFile = join(root, "src", "lib", "route-manifest.json");

/* Auth-protected prefixes come from the proxy middleware — parsed, not
   duplicated, so the two can't disagree. */
function readProtectedPrefixes() {
  const src = readFileSync(join(root, "src", "lib", "supabase", "middleware.ts"), "utf8");
  const m = src.match(/const PROTECTED\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error("Could not find PROTECTED list in src/lib/supabase/middleware.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/* Dynamic segments and where their live values come from (Supabase). */
/* Some dynamic pages are addressed by a bearer secret rather than by a slug.
   Enumerating them would mean pulling live credentials into an audit and
   walking them — the opposite of what the secret is for. They are marked
   credential-bearing instead, and the audit leaves them alone. */
const CREDENTIAL_ROUTES = new Set(["/sign/[token]"]);

/* Reviewer surfaces that exist only under `next dev` — the page itself calls
   notFound() in production. Classified here rather than left "public" so the
   sitemap never advertises a URL that 404s in the deploy. */
const DEV_ROUTES = new Set(["/preview/documents"]);

const DYNAMIC_SOURCES = {
  "/episodes/[slug]": { table: "episodes", column: "slug" },
  "/log/[slug]": { table: "log_posts", column: "slug" },
  /* The audit reads this table as anon, and `series` is anon-readable only
     where `active` — so the expansion is the five live strands and never a
     stood-down one, which the page 404s on by design. */
  "/series/[slug]": { table: "series", column: "slug" },
  "/regattas/[slug]": { table: "contests", column: "slug" },
  "/agreements/[code]": { table: "documents", column: "code" },
  /* crew_roles is anon-readable by policy ("roles are public"), so the audit
     expands every posting including closed ones — which is correct: a closed
     posting still renders, saying so, rather than 404ing a URL a candidate has
     on their clipboard. */
  /* Postings moved under /crew/wanted when /crew became the people. */
  "/crew/wanted/[slug]": { table: "crew_roles", column: "slug" },
  /* Only the crew who opted in are anon-readable, so the audit expands exactly
     the pages that exist for a signed-out reader — which is the set that should
     be crawlable.

     allowEmpty because that set is legitimately none until somebody opts in:
     crew.public defaults to false, and the alternative was inventing a person
     to satisfy a counter. Unknown slugs must still 404, and every crew member
     who does appear is still crawled. */
  "/crew/[slug]": { table: "crew", column: "slug", allowEmpty: true },
};

function walk(dir, segments = []) {
  const routes = [];
  const entries = readdirSync(dir).filter((e) => !e.startsWith("_") && !e.startsWith("."));
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Route groups "(site)" organize files but do not appear in the URL.
      const isGroup = entry.startsWith("(") && entry.endsWith(")");
      routes.push(...walk(full, isGroup ? segments : [...segments, entry]));
    } else if (entry === "page.tsx" || entry === "page.ts") {
      routes.push({ path: "/" + segments.join("/"), file: relative(root, full), type: "page" });
    } else if (entry === "route.ts" || entry === "route.tsx") {
      const src = readFileSync(full, "utf8");
      const methods = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g)].map((m) => m[1]);
      routes.push({ path: "/" + segments.join("/"), file: relative(root, full), type: "handler", methods });
    }
  }
  return routes;
}

const protectedPrefixes = readProtectedPrefixes();
const isProtected = (p) => protectedPrefixes.some((pre) => p === pre || p.startsWith(pre + "/"));

const routes = walk(appDir)
  .map((r) => {
    const dynamic = r.path.includes("[");
    return {
      ...r,
      path: r.path === "/" ? "/" : r.path.replace(/\/$/, ""),
      dynamic,
      access: isProtected(r.path)
        ? "member"
        : DEV_ROUTES.has(r.path)
          ? "dev"
          : r.path.startsWith("/auth") || r.path === "/gangway"
            ? "auth"
            : "public",
      ...(dynamic && DYNAMIC_SOURCES[r.path] ? { source: DYNAMIC_SOURCES[r.path] } : {}),
      ...(CREDENTIAL_ROUTES.has(r.path) ? { credential: true } : {}),
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

/* Only pages need a slug source — they are what the sitemap and the audit
   expand. Dynamic route handlers (.ics feeds, stubs) are addressed by
   secret or by code and are never enumerated. */

const unsourced = routes.filter(
  (r) => r.dynamic && !r.source && r.type === "page" && !CREDENTIAL_ROUTES.has(r.path)
);
if (unsourced.length) {
  console.warn(
    "route-manifest: dynamic routes without a slug source (add to DYNAMIC_SOURCES to include them in sitemap/audit):\n" +
      unsourced.map((r) => "  " + r.path).join("\n")
  );
}

const manifest = { $comment: "Generated by scripts/generate-route-manifest.mjs — do not edit by hand.", protectedPrefixes, routes };
const json = JSON.stringify(manifest, null, 2) + "\n";
const previous = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
if (previous !== json) {
  writeFileSync(outFile, json);
  console.log(`route-manifest: wrote ${routes.length} routes to src/lib/route-manifest.json`);
} else {
  console.log(`route-manifest: up to date (${routes.length} routes)`);
}
