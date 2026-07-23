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
    include: ["src/**/*.test.{ts,tsx}"],
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
    },
  },
});
