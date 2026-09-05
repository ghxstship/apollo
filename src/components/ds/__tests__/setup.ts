/* Setup for the `kit` vitest project (see vitest.config.ts), after
   ./dom-shims.ts has stood in for the parts of a browser jsdom lacks. */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/* Testing Library's auto-cleanup only runs when it can detect a global
   afterEach at import time; registering it here is the explicit form and does
   not depend on that detection. Without it the previous test's DOM is still on
   the page and `getByRole` finds two of everything — and the two surfaces that
   portal into document.body would accumulate there all suite long. */
afterEach(cleanup);
