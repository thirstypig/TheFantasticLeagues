import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "child_process";
import { fileURLToPath } from "url";


let commitHash = "unknown";
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch (e) {
  console.warn("Could not determine commit hash", e);
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("../shared", import.meta.url)),
      "posthog-js": "posthog-js/dist/module.slim.no-external.js",
      // Pin `zod` to the client's installed copy so files in `shared/api`
      // (which has no node_modules of its own) resolve cleanly at runtime.
      // Without this Vite/Rollup walks up from `shared/` and fails because
      // there's no `node_modules` at the worktree root.
      zod: fileURLToPath(new URL("./node_modules/zod/index.js", import.meta.url)),
    },
  },
  define: {
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [react()],
  server: {
    port: 3010,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4010",
        secure: false,
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:4010",
        ws: true,
      },
    },
  },
});
