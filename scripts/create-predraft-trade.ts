/**
 * One-time script: Create the pre-draft trade record
 * Devil Dawgs traded Cedric Mullins + $75 to DLC for Kyle Tucker
 *
 * Usage: cd server && npx tsx ../scripts/create-predraft-trade.ts
 */
import { prisma } from "../server/src/db/prisma.js";

async function main() {
  const leagueId = 20; // OGBA 2026

  // Look up team IDs
  const dd = await prisma.team.findFirst({ where: { leagueId, name: { contains: "Devil" } }, select: { id: true, name: true } });
  const dlc = await prisma.team.findFirst({ where: { leagueId, name: { contains: "Demolition" } }, select: { id: true, name: true } });
  if (!dd || !dlc) { console.error("Teams not found:", { dd, dlc }); process.exit(1); }

  // Look up player IDs
  const mullins = await prisma.player.findFirst({ where: { mlbId: 656775 }, select: { id: true, name: true } });
  const tucker = await prisma.player.findFirst({ where: { mlbId: 663656 }, select: { id: true, name: true } });
  if (!mullins || !tucker) { console.error("Players not found:", { mullins, tucker }); process.exit(1); }

  console.log(`Creating trade: ${dd.name} sends ${mullins.name} + $75 to ${dlc.name} for ${tucker.name}`);

  // Check if trade already exists
  const existing = await prisma.trade.findFirst({
    where: {
      leagueId,
      status: "PROCESSED",
      items: { some: { playerId: mullins.id, assetType: "PLAYER" } },
    },
  });
  if (existing) { console.log("Trade already exists (id=" + existing.id + "). Skipping."); process.exit(0); }

  const trade = await prisma.trade.create({
    data: {
      leagueId,
      proposerId: dd.id,
      status: "PROCESSED",
      processedAt: new Date("2026-03-15T00:00:00Z"),
      items: {
        create: [
          { senderId: dd.id, recipientId: dlc.id, assetType: "PLAYER", playerId: mullins.id },
          { senderId: dd.id, recipientId: dlc.id, assetType: "BUDGET", amount: 75 },
          { senderId: dlc.id, recipientId: dd.id, assetType: "PLAYER", playerId: tucker.id },
        ],
      },
    },
    include: { items: true },
  });

  console.log(`Trade created: id=${trade.id}, ${trade.items.length} items`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
