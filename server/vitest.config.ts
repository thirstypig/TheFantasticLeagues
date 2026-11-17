import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // 15s, not the 5s default (todo #318): tests that take ~1s alone ran 6.5x slower
    // under full-suite load and hit 5s. The timeout is there to catch hangs, which
    // 15s still does.
    testTimeout: 15_000,
    // supertest connects to [::1], not 127.0.0.1 (todo #318; see the file).
    setupFiles: ["./src/test/ipv6Loopback.ts"],
    // Pick up server tests AND shared-contract tests (todo #118). The
    // shared schemas in `../shared/api/` are imported by both client and
    // server; running their contract tests under the server vitest gives
    // them a Node environment without standing up a separate test runner.
    // Also picks up the repo-root docs-system scripts (scripts/*.mjs). They have
    // no other test runner, and they write to tracked files — so their pure
    // helpers are worth guarding. Same rationale as ../shared above.
    include: ["src/**/*.test.ts", "../shared/**/*.test.ts", "../scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/seed.ts"],
    },
  },
});
