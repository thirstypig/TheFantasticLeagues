/**
 * Find mid-period roster changes that could cause attribution errors.
 * A "mid-period" change is one where releasedAt falls AFTER period.startDate
 * and BEFORE period.endDate — i.e., the player changed teams mid-period.
 */
import { prisma } from "../db/prisma.js";

async function main() {
  const periods = [
    { name: "Period 1", start: new Date("2026-03-25"), end: new Date("2026-04-18") },
    { name: "Period 2", start: new Date("2026-04-19"), end: new Date("2026-05-16") },
    { name: "Period 3", start: new Date("2026-05-17"), end: new Date("2026-06-06") },
  ];

  for (const period of periods) {
    console.log(`\n=== ${period.name}: ${period.start.toISOString().slice(0,10)} → ${period.end.toISOString().slice(0,10)} ===`);

    // Players released strictly after period start AND on or before period end
    const drops = await prisma.roster.findMany({
      where: {
        team: { leagueId: 20 },
        releasedAt: { gt: period.start, lte: period.end },
      },
      select: {
        teamId: true, playerId: true, acquiredAt: true, releasedAt: true,
        team: { select: { name: true, code: true } },
        player: { select: { name: true } },
      },
      orderBy: { releasedAt: "asc" },
    });

    if (drops.length === 0) {
      console.log("  No mid-period transactions.");
      continue;
    }

    // For each dropped player, check if they were picked up mid-period
    for (const d of drops) {
      const pickups = await prisma.roster.findMany({
        where: {
          playerId: d.playerId,
          teamId: { not: d.teamId },
          acquiredAt: { gte: d.releasedAt!, lte: period.end },
          team: { leagueId: 20 },
        },
        select: {
          teamId: true, acquiredAt: true,
          team: { select: { name: true, code: true } },
        },
      });

      const dropDate = d.releasedAt!.toISOString().slice(0,10);
      if (pickups.length > 0) {
        const pickup = pickups[0];
        const pickupDate = pickup.acquiredAt.toISOString().slice(0,10);
        const waiveredDays = Math.round((pickup.acquiredAt.getTime() - d.releasedAt!.getTime()) / 86400000);
        console.log(`  TRADE/WAIVER: ${d.player.name}`);
        console.log(`    Dropped by ${d.team.code} on ${dropDate}`);
        console.log(`    Picked up by ${pickup.team.code} on ${pickupDate} (${waiveredDays}d gap)`);
        console.log(`    ⚠ computeWithPeriodStats credits ${pickup.team.code} with FULL period PSP (incl. pre-${pickupDate} stats)`);
      } else {
        console.log(`  DROP (no pickup): ${d.player.name} — dropped by ${d.team.code} on ${dropDate}`);
        console.log(`    ✓ PSP path: nobody gets credit (no end-of-period owner)`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
