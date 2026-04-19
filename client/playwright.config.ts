import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for TFL.
 *
 * Assumes both dev servers are already running:
 *   - Vite @ http://localhost:3010
 *   - Express API @ http://localhost:4010
 *
 * Run with:
 *   npm run test:e2e          # headless
 *   npm run test:e2e:ui       # Playwright UI mode (interactive)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // League state is shared across tests today; serialize until we isolate fixtures.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://localhost:3010",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
