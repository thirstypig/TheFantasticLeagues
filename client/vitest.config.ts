import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [react()],
  // Top-level (not just under `test`): Vitest 4's module runner enforces fs.allow from
  // the root Vite server config. Needed so ?raw imports of the four root docs
  // (CLAUDE.md / README.md / FEEDBACK.md / ROADMAP.md) resolve in tests.
  server: {
    fs: { allow: [".", fileURLToPath(new URL("..", import.meta.url))] },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
      // Mirrors vite.config.ts — pin zod to client's copy so files in
      // shared/api resolve cleanly when imported from client code.
      zod: fileURLToPath(new URL("./node_modules/zod/index.js", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    // 15s, not the 5s default (todo #318): tests that take ~1s alone ran 6.5x slower
    // under full-suite load and hit 5s. The timeout is there to catch hangs, which
    // 15s still does.
    testTimeout: 15_000,
    include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
    setupFiles: ["./src/test/setup.ts"],
    server: {
      fs: {
        // Allow ?raw imports of files outside client/ (docs/, shared/, and the four
        // root docs — CLAUDE.md / README.md / FEEDBACK.md / ROADMAP.md — which the
        // /docs board globs alongside docs/**). Absolute path: a relative ".." is not
        // resolved against this config's directory by Vite's fs.allow.
        allow: [".", fileURLToPath(new URL("..", import.meta.url))],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
      // text-summary prints to the CI log; json-summary feeds the PR run summary.
      reporter: ["text-summary", "json-summary"],
      // A floor, not a target: set just under the 2026-11-19 baseline
      // (51.78% lines). Raise when coverage goes up; never lower to pass a PR.
      thresholds: { lines: 51, statements: 50, branches: 43, functions: 46 },
    },
  },
});
