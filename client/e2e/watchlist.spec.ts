import { test, expect } from "@playwright/test";
import { loginViaDev } from "./helpers/auth";

/**
 * Golden-path: a team owner can star a player on the Players page, see that
 * star reflected on the Activity → Add/Drop tab, and have it survive a reload.
 *
 * Guards against the Session 68/69 regression where `normalizeTwoWayRow` was
 * stripping `Player.id` — which made every watchlist star button return null.
 */
test.describe("Watchlist round-trip", () => {
  test("star on Players persists to Add/Drop and survives reload", async ({ page }) => {
    await loginViaDev(page);

    // Players page — pick a low-games player (Maximo Acosta, 0 G) by searching.
    // Default view hides 0-game unrostered players, so search is the reliable path.
    await page.goto("/players");
    await page.getByRole("searchbox", { name: /Search players/i }).fill("Acosta");
    const row = page.getByRole("row", { name: /Maximo Acosta/i });
    await expect(row).toBeVisible({ timeout: 10_000 });

    const star = row.getByLabel(/Add to watchlist|Remove from watchlist/i);
    const startState = await star.getAttribute("aria-pressed");

    // If already starred from a previous run, unstar first so the test is deterministic.
    if (startState === "true") {
      await star.click();
      await expect(row.getByLabel(/Add to watchlist/i)).toHaveAttribute("aria-pressed", "false");
    }

    // Click the star → becomes pressed + filled.
    await row.getByLabel(/Add to watchlist/i).click();
    await expect(row.getByLabel(/Remove from watchlist/i)).toHaveAttribute("aria-pressed", "true");

    // Navigate to Activity → Add / Drop — same player should show a pressed star.
    await page.goto("/activity?tab=add_drop");
    const addDropRow = page.getByRole("row", { name: /Maximo Acosta/i });
    await expect(addDropRow).toBeVisible({ timeout: 10_000 });
    await expect(
      addDropRow.getByLabel(/Remove from watchlist/i),
    ).toHaveAttribute("aria-pressed", "true");

    // Reload — star must still be pressed (persistence check).
    await page.reload();
    const reloadedRow = page.getByRole("row", { name: /Maximo Acosta/i });
    await expect(reloadedRow).toBeVisible({ timeout: 10_000 });
    await expect(
      reloadedRow.getByLabel(/Remove from watchlist/i),
    ).toHaveAttribute("aria-pressed", "true");

    // Clean up — unstar so the next run starts fresh.
    await reloadedRow.getByLabel(/Remove from watchlist/i).click();
    await expect(
      reloadedRow.getByLabel(/Add to watchlist/i),
    ).toHaveAttribute("aria-pressed", "false");
  });
});
