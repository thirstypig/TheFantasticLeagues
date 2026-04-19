import { Page, expect } from "@playwright/test";

/**
 * Click the Dev Login button on the auth page and wait for the dashboard.
 * Dev Login uses the admin user in the DB + the DEV_LOGIN_PASSWORD env var
 * and is gated by ENABLE_DEV_LOGIN=true on the server.
 */
export async function loginViaDev(page: Page) {
  await page.goto("/login");
  const devBtn = page.getByRole("button", { name: /Dev Login/i });
  await devBtn.click();
  // Dev Login does a hard redirect to "/" — wait for that, then for the Home dashboard marker.
  await page.waitForURL("**/");
  await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible({ timeout: 15_000 });
}
