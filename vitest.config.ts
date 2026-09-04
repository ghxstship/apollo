import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      /* `server-only` throws on import outside an RSC bundle. The pure helpers
         beside server code (duesNote) are still worth a test. */
      "server-only": path.resolve(__dirname, "src/lib/__tests__/stubs/server-only.ts"),
    },
  },
});
