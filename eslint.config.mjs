import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The design-system handoff is specification, not app code. Kit v2's
    // operations-kit ships its template's own runtime scripts (ds-base.js,
    // policy-doc.js, support.js) which target the Claude Design canvas, not
    // this app — linting them holds artwork to app rules.
    "docs/brand/_handoff/**",
  ]),
]);

export default eslintConfig;
