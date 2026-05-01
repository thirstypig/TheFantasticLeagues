import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Pick up server tests AND shared-contract tests (todo #118). The
    // shared schemas in `../shared/api/` are imported by both client and
    // server; running their contract tests under the server vitest gives
    // them a Node environment without standing up a separate test runner.
    include: ["src/**/*.test.ts", "../shared/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/seed.ts"],
    },
  },
});
