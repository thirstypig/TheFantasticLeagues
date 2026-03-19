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
      "posthog-js": "posthog-js/dist/module.slim.no-external.js",
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
