/**
 * Sync NL player rosters from MLB Stats API into the Player table.
 * Usage: cd server && npx tsx ../scripts/sync-mlb-players.ts
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Use the same Prisma instance path as the server
import { syncNLPlayers } from "../server/src/features/players/services/mlbSyncService.js";

const season = 2026;
console.log(`Syncing NL players for ${season} season...`);

syncNLPlayers(season)
  .then((result) => {
    console.log("\nSync complete:");
    console.log(`  NL teams processed: ${result.teams}`);
    console.log(`  Players created: ${result.created}`);
    console.log(`  Players updated: ${result.updated}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
