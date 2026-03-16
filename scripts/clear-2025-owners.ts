/**
 * Remove all team owners from the 2025 season (league ID 1).
 * Keeps teams and players intact, just clears ownership.
 *
 * Usage: npx tsx scripts/clear-2025-owners.ts
 */

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";

const prisma = new PrismaClient();

const LEAGUE_ID = 1; // OGBA 2025

async function main() {
  const teams = await prisma.team.findMany({
    where: { leagueId: LEAGUE_ID },
    select: { id: true, name: true, owner: true, ownerUserId: true },
  });

  console.log(`Found ${teams.length} teams in league ${LEAGUE_ID}:\n`);

  for (const t of teams) {
    console.log(`  ${t.name} (ID ${t.id}) — owner: ${t.owner}, ownerUserId: ${t.ownerUserId}`);

    // Clear team owner fields
    await prisma.team.update({
      where: { id: t.id },
      data: { owner: null, ownerUserId: null },
    });

    // Remove team ownerships
    const deleted = await prisma.teamOwnership.deleteMany({
      where: { teamId: t.id },
    });
    if (deleted.count > 0) {
      console.log(`    Removed ${deleted.count} ownership(s)`);
    }
  }

  // Remove league memberships for 2025 (keep franchise memberships intact)
  const memberships = await prisma.leagueMembership.deleteMany({
    where: { leagueId: LEAGUE_ID },
  });
  console.log(`\nRemoved ${memberships.count} league membership(s) for league ${LEAGUE_ID}`);

  console.log("\nDone! Teams and players preserved, owners cleared.");
}

main()
  .catch((e) => { console.error("Failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
