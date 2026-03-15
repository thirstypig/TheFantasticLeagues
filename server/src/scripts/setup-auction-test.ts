// Setup script: Populate league 2 for auction end-to-end test
// Run: cd server && npx tsx src/scripts/setup-auction-test.ts

import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("=== STEP 1: Assign owners to league 2 teams ===");

  const league1Teams = await prisma.team.findMany({
    where: { leagueId: 1 },
    select: { code: true, owner: true, ownerUserId: true },
  });
  const codeToOwner = new Map(
    league1Teams.map((t) => [t.code, { owner: t.owner, ownerUserId: t.ownerUserId }])
  );

  const league2Teams = await prisma.team.findMany({ where: { leagueId: 2 } });
  for (const t of league2Teams) {
    const match = t.code ? codeToOwner.get(t.code) : undefined;
    if (match && match.ownerUserId) {
      await prisma.team.update({
        where: { id: t.id },
        data: { owner: match.owner, ownerUserId: match.ownerUserId },
      });
      console.log(`  ${t.code} (${t.name}) → userId ${match.ownerUserId} (${match.owner})`);
    }
  }

  console.log("\n=== STEP 2: Add league memberships for league 2 ===");
  const userIds = [4, 5, 6, 7, 8, 9, 10];
  for (const userId of userIds) {
    try {
      await prisma.leagueMembership.create({
        data: { leagueId: 2, userId, role: "OWNER" },
      });
      console.log(`  Added membership: userId ${userId} → league 2 (OWNER)`);
    } catch {
      console.log(`  Membership already exists: userId ${userId}`);
    }
  }

  console.log("\n=== STEP 3: Add team ownerships for league 2 ===");
  const updatedTeams = await prisma.team.findMany({
    where: { leagueId: 2 },
    select: { id: true, code: true, ownerUserId: true },
  });
  for (const t of updatedTeams) {
    if (t.ownerUserId) {
      try {
        await prisma.teamOwnership.create({
          data: { teamId: t.id, userId: t.ownerUserId },
        });
        console.log(`  Added ownership: team ${t.code} → userId ${t.ownerUserId}`);
      } catch {
        console.log(`  Ownership already exists: team ${t.code}`);
      }
    }
  }

  console.log("\n=== STEP 4: Populate rosters from league 1 → league 2 ===");
  const league1Rosters = await prisma.roster.findMany({
    where: { team: { leagueId: 1 }, releasedAt: null },
    include: { player: true, team: { select: { code: true } } },
  });

  const league2TeamByCode = new Map(updatedTeams.map((t) => [t.code, t.id]));

  // Clear existing rosters first
  const existingCount = await prisma.roster.count({
    where: { team: { leagueId: 2 }, releasedAt: null },
  });
  if (existingCount > 0) {
    console.log(`  Clearing ${existingCount} existing roster entries...`);
    await prisma.roster.deleteMany({ where: { team: { leagueId: 2 } } });
  }

  let added = 0;
  for (const r of league1Rosters) {
    const teamCode = r.team.code;
    const targetTeamId = teamCode ? league2TeamByCode.get(teamCode) : undefined;
    if (!targetTeamId) {
      console.log(`  Skipped: no match for team code ${teamCode}`);
      continue;
    }
    await prisma.roster.create({
      data: {
        teamId: targetTeamId,
        playerId: r.playerId,
        source: "prior_season",
        price: r.price,
        isKeeper: false,
      },
    });
    added++;
  }
  console.log(`  Added ${added} roster entries to league 2`);

  console.log("\n=== STEP 5: Create 2026 season for league 2 ===");
  try {
    const season = await prisma.season.create({
      data: { leagueId: 2, year: 2026, status: "SETUP" },
    });
    console.log(`  Created season: id=${season.id}, year=${season.year}, status=${season.status}`);
  } catch {
    console.log("  Season already exists, fetching...");
    const s = await prisma.season.findUnique({
      where: { leagueId_year: { leagueId: 2, year: 2026 } },
    });
    console.log(`  Existing season: id=${s?.id}, status=${s?.status}`);
  }

  console.log("\n=== STEP 6: Select 4 keepers per team (top 4 by price) ===");
  const teams = await prisma.team.findMany({
    where: { leagueId: 2 },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { name: true, posPrimary: true } } },
        orderBy: { price: "desc" },
      },
    },
  });

  for (const team of teams) {
    const topKeepers = team.rosters.slice(0, 4);
    const keeperIds = topKeepers.map((r) => r.id);

    await prisma.roster.updateMany({
      where: { teamId: team.id },
      data: { isKeeper: false },
    });
    if (keeperIds.length > 0) {
      await prisma.roster.updateMany({
        where: { id: { in: keeperIds } },
        data: { isKeeper: true },
      });
    }

    const keeperCost = topKeepers.reduce((sum, r) => sum + r.price, 0);
    console.log(
      `  ${team.code} keepers ($${keeperCost}): ${topKeepers.map((r) => `${r.player.name}/$${r.price}/${r.player.posPrimary}`).join(", ")}`
    );
  }

  console.log("\n=== STEP 7: Release non-keepers ===");
  const releaseResult = await prisma.roster.updateMany({
    where: {
      team: { leagueId: 2 },
      isKeeper: false,
      releasedAt: null,
    },
    data: { releasedAt: new Date() },
  });
  console.log(`  Released ${releaseResult.count} non-keeper roster entries`);

  // Final state
  console.log("\n=== FINAL STATE (league 2, ready for auction) ===");
  const finalTeams = await prisma.team.findMany({
    where: { leagueId: 2 },
    include: {
      rosters: {
        where: { releasedAt: null },
        include: { player: { select: { name: true, posPrimary: true } } },
      },
    },
    orderBy: { id: "asc" },
  });

  for (const team of finalTeams) {
    const keeperCost = team.rosters.reduce((sum, r) => sum + r.price, 0);
    const pitchers = team.rosters.filter((r) =>
      ["P", "SP", "RP", "TWP"].includes(r.player.posPrimary.toUpperCase())
    ).length;
    const hitters = team.rosters.length - pitchers;
    console.log(
      `  ${team.code} (${team.name}) — ${team.rosters.length} keepers (${hitters}H/${pitchers}P), $${keeperCost} spent, $${400 - keeperCost} budget, ${23 - team.rosters.length} spots left`
    );
    console.log(
      `    Keepers: ${team.rosters.map((r) => `${r.player.name}($${r.price},${r.player.posPrimary})`).join(", ")}`
    );
  }

  await prisma.$disconnect();
  console.log("\n✅ Setup complete. League 2 is ready for auction testing.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
