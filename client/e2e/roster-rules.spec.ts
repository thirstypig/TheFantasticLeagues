import { test, expect } from "@playwright/test";
import { loginViaDev } from "./helpers/auth";

/**
 * Phase 4 UI smoke tests for the roster-rules / IL slot feature.
 *
 * These are intentionally shallow: actually exercising the IL stash flow
 * requires staging a rostered player whose MLB status starts with "Injured
 * List …", which is non-deterministic against a live MLB feed. The tests
 * below verify the new UI surfaces render and are interactive; deeper
 * verification belongs in server integration tests (Testcontainers plan).
 */

test.describe("Phase 4 roster-rules UI smoke", () => {
  test("Team page renders IL subsection heading when IL-slotted players exist", async ({ page }) => {
    await loginViaDev(page);
    await page.goto("/season");

    // Click the first team tile to reach /teams/:teamCode
    const firstTeamLink = page.locator('a[href^="/teams/"]').first();
    await expect(firstTeamLink).toBeVisible({ timeout: 10_000 });
    await firstTeamLink.click();
    await expect(page).toHaveURL(/\/teams\//);

    // Hitters or pitchers table must render (page isn't broken)
    await expect(
      page.getByRole("table", { name: /Hitter statistics|Pitcher statistics/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // IL subsection header is present only when the team has IL-slotted
    // players — we don't assert presence, only that if it's there the table
    // renders with a MLB STATUS column (the Phase 4 addition).
    const ilHeader = page.getByText(/^Your IL Slots/);
    if (await ilHeader.count() > 0) {
      await expect(ilHeader.first()).toBeVisible();
      await expect(page.getByRole("table", { name: /Fantasy IL slots/i })).toBeVisible();
    }
  });

  test("Waiver claim form shows required drop dropdown in-season", async ({ page }) => {
    await loginViaDev(page);
    await page.goto("/activity?tab=waivers");

    // Search input is the form's entry point
    const search = page.getByPlaceholder(/Type player name/i);
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill("Acuna");

    // First result → select
    const firstResult = page.getByRole("button", { name: /Acuna/i }).first();
    if (await firstResult.count() === 0) {
      test.skip(true, "No players named Acuna in dev DB — environment-dependent");
      return;
    }
    await firstResult.click();

    // Drop-player dropdown appears with the Phase 4 label.
    // If the dev DB season is not IN_SEASON the label says "optional"; both are fine.
    await expect(page.getByText(/Drop Player.*required in-season|Drop Player.*optional/i)).toBeVisible();
  });

  test("Commissioner Teams tab renders (banner appears only if ghost-IL exists)", async ({ page }) => {
    await loginViaDev(page);

    // Land on home, let LeagueContext resolve a leagueId
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to the commissioner page via the sidebar/nav if available.
    // Fall back to /commissioner/1 as dev DB's primary league.
    await page.goto("/commissioner/1");

    // The Teams tab button
    const teamsTab = page.getByRole("button", { name: /^Teams$/ }).first();
    if (await teamsTab.count() === 0) {
      test.skip(true, "Commissioner page unavailable for dev user — environment-dependent");
      return;
    }
    await teamsTab.click();

    // Teams tab content renders ("Teams" heading inside the tab panel)
    await expect(page.getByText(/^Teams$/).first()).toBeVisible({ timeout: 10_000 });

    // If the banner is shown, its [Details] button must be clickable
    const banner = page.getByText(/have ghost-IL player/i);
    if (await banner.count() > 0) {
      const details = page.getByRole("button", { name: /Details|Hide/i }).first();
      await details.click();
      // Toggle back
      await details.click();
    }
  });
});
