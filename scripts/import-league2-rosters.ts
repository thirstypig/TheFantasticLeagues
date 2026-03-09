/**
 * Import League 2 rosters directly via Prisma.
 *
 * Steps:
 * 1. Reset all active rosters for League 2
 * 2. Import from the merged CSV
 *
 * Usage: cd server && npx tsx ../scripts/import-league2-rosters.ts
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";
import fs from "fs";

const prisma = new PrismaClient();

const CSV_FILE = path.resolve(
  process.env.HOME!,
  "downloads/league2-roster-import.csv"
);
const LEAGUE_ID = 2;

async function main() {
  // 1. Verify league exists and get teams
  const league = await prisma.league.findUnique({
    where: { id: LEAGUE_ID },
    include: { teams: true },
  });
  if (!league) throw new Error("League 2 not found");

  console.log(`League: ${league.name} (${league.season})`);
  console.log(`Teams: ${league.teams.length}`);
  for (const t of league.teams) {
    console.log(`  ${t.id}: ${t.name} (code: ${t.code || "none"}, budget: ${t.budget})`);
  }

  // Build team name → ID map (case-insensitive)
  const teamMap = new Map<string, number>();
  for (const t of league.teams) {
    teamMap.set(t.name.trim().toLowerCase(), t.id);
    if (t.code) teamMap.set(t.code.trim().toLowerCase(), t.id);
  }

  // 2. Reset active rosters
  const teamIds = league.teams.map((t) => t.id);
  const resetResult = await prisma.roster.updateMany({
    where: { teamId: { in: teamIds }, releasedAt: null },
    data: { releasedAt: new Date() },
  });
  console.log(`\nReset: released ${resetResult.count} active roster entries`);

  // 3. Parse CSV
  const csv = fs.readFileSync(CSV_FILE, "utf-8");
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());

  let imported = 0;
  let errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((s) => s.trim());
    const playerName = cols[0];
    const mlbTeam = cols[1];
    const fantasyTeam = cols[2];
    const cost = parseInt(cols[3], 10) || 1;
    const isKeeper = cols[4]?.toLowerCase() === "true";
    const pos = cols[5] || "UT";

    const teamId = teamMap.get(fantasyTeam.trim().toLowerCase());
    if (!teamId) {
      errors.push(`Line ${i + 1}: Team not found: "${fantasyTeam}" (${playerName})`);
      continue;
    }

    // Find or create player
    let player = await prisma.player.findFirst({
      where: { name: { equals: playerName, mode: "insensitive" } },
    });

    if (!player) {
      player = await prisma.player.create({
        data: {
          name: playerName,
          mlbTeam: mlbTeam || null,
          posPrimary: pos,
          posList: pos,
        },
      });
    } else if (mlbTeam && mlbTeam !== player.mlbTeam) {
      // Update MLB team if changed
      await prisma.player.update({
        where: { id: player.id },
        data: { mlbTeam },
      });
    }

    // Check if already on this team's active roster (idempotent re-run)
    const existing = await prisma.roster.findFirst({
      where: { teamId, playerId: player.id, releasedAt: null },
    });
    if (existing) {
      // Update price if different
      if (existing.price !== cost) {
        await prisma.roster.update({
          where: { id: existing.id },
          data: { price: cost, assignedPosition: pos },
        });
      }
      imported++;
      continue;
    }

    // Create roster entry
    await prisma.roster.create({
      data: {
        teamId,
        playerId: player.id,
        price: cost,
        isKeeper,
        source: "SEASON_IMPORT",
        assignedPosition: pos,
      },
    });

    imported++;
  }

  console.log(`\nImported: ${imported} roster entries`);
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ${e}`);
  }

  // 4. Verify counts
  console.log("\n--- Verification ---");
  for (const t of league.teams) {
    const count = await prisma.roster.count({
      where: { teamId: t.id, releasedAt: null },
    });
    const pitchers = await prisma.roster.count({
      where: { teamId: t.id, releasedAt: null, assignedPosition: "P" },
    });
    const hitters = count - pitchers;
    const status = count === 23 ? "OK" : "MISMATCH";
    console.log(`  ${t.name}: ${hitters}H + ${pitchers}P = ${count} [${status}]`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
