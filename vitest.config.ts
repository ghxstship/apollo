import { defineConfig } from "vitest/config";
import path from "node:path";

/* Two suites, one command.

   `npx vitest run` (which is what `npm run gates` calls) has to run both, so
   they are declared as projects rather than as two configs behind two scripts:
   a second script is a second thing to remember, and the gate battery would
   have gone on proving only half of it.

   lib  — the 21 pure-logic suites that were here first. Node environment, no
          DOM, `.ts` only. Unchanged: same include, same environment, same
          speed. A DOM would only slow them down.
   kit  — the design system. jsdom, `.tsx`, Testing Library, and two setup
          files: the shims for what jsdom does not implement, then the
          matchers and cleanup. Scoped to src/components so a future DOM test
          lands here by living next to the component it covers.

   The `include` globs do not overlap, so nothing runs twice. */
const alias = {
  "@": path.resolve(__dirname, "src"),
  /* `server-only` throws on import outside an RSC bundle. The pure helpers
     beside server code (duesNote) are still worth a test. */
  "server-only": path.resolve(__dirname, "src/lib/__tests__/stubs/server-only.ts"),
};

/* No JSX plugin. Vite's own transformer reads tsconfig's `jsx: "react-jsx"`
   and gives the .tsx tests the automatic runtime, which is what the kit is
   written for; adding @vitejs/plugin-react would pull Babel in for a Fast
   Refresh nothing in a test run wants. If tsconfig's `jsx` ever changes, the
   kit suite fails loudly with "React is not defined" rather than quietly. */

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "lib",
          include: ["src/lib/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "kit",
          include: ["src/components/**/*.test.tsx"],
          environment: "jsdom",
          /* Order matters: dom-shims.ts must run before anything imports
             react-dom. See its header. */
          setupFiles: [
            path.resolve(__dirname, "src/components/ds/__tests__/dom-shims.ts"),
            path.resolve(__dirname, "src/components/ds/__tests__/setup.ts"),
          ],
        },
      },
    ],
  },
});
