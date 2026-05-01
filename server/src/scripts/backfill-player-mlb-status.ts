/**
 * Backfill Player.mlbStatus from the MLB Stats API 40-man rosters.
 *
 * Companion to the prisma/migrations/20260430120000_player_mlb_status
 * migration. The migration adds a nullable column; existing rows are
 * NULL until either:
 *   - the daily syncAllPlayers cron tick runs (next 12:00 UTC), or
 *   - this script runs manually post-deploy
 *
 * Without the backfill, the v3 hub's ghost-IL warning chip stays
 * dormant for the first ~24h after the migration applies. Running this
 * script makes the chip live immediately.
 *
 * Mechanics: just calls `syncAllPlayers(<season>)` — the daily cron's
 * core function — which now writes Player.mlbStatus alongside name /
 * mlbTeam / posPrimary / posList. Idempotent and safe to run multiple
 * times. Skips the AAA roster sync (different endpoint, no 40-man
 * status to backfill from anyway).
 *
 * Usage:
 *   npx tsx server/src/scripts/backfill-player-mlb-status.ts [--year 2026]
 *
 * The --year flag defaults to the current calendar year. The script
 * exits 0 on success and 1 on any partial failure.
 */
import { syncAllPlayers } from "../features/players/services/mlbSyncService.js";
import { logger } from "../lib/logger.js";
import { parseYear } from "./lib/cli.js";

async function main() {
  const season = parseYear(new Date().getFullYear());

  console.log(`\n→ Backfilling Player.mlbStatus from MLB 40-man rosters (season=${season})\n`);

  const start = Date.now();
  const result = await syncAllPlayers(season);
  const elapsedSec = Math.round((Date.now() - start) / 1000);

  console.log(`\n✓ Backfill complete in ${elapsedSec}s`);
  console.log(`  teams processed:  ${result.teams}`);
  console.log(`  players created:  ${result.created}`);
  console.log(`  players updated:  ${result.updated}`);
  console.log(`  team changes:     ${result.teamChanges.length}`);

  if (result.teamChanges.length > 0) {
    console.log("\n  First few team changes:");
    for (const tc of result.teamChanges.slice(0, 5)) {
      console.log(`    - ${tc.name}: ${tc.from} → ${tc.to}`);
    }
  }

  console.log("\nNote: mlbStatus is written verbatim from the API per IL #1.");
  console.log("      Players who weren't on a 40-man at sync time keep mlbStatus = NULL.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ error: String(err) }, "backfill-player-mlb-status failed");
    console.error("\n✗ Backfill failed:", err);
    process.exit(1);
  });
