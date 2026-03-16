/**
 * Data migration: populate Franchise + FranchiseMembership tables from existing League data.
 *
 * For each distinct League.name:
 *   1. Create a Franchise row using org-level fields from the latest season
 *   2. Set franchiseId on all League rows with that name
 *   3. Collect all LeagueMembership entries, deduplicate by userId, create FranchiseMembership
 *      (using the highest role: COMMISSIONER > OWNER)
 *
 * Usage: npx tsx scripts/migrate-franchises.ts
 */

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting franchise data migration...\n");

  // 1. Get all leagues grouped by name
  const leagues = await prisma.league.findMany({
    orderBy: [{ name: "asc" }, { season: "desc" }],
    include: {
      memberships: { select: { userId: true, role: true } },
    },
  });

  const byName = new Map<string, typeof leagues>();
  for (const league of leagues) {
    const arr = byName.get(league.name) ?? [];
    arr.push(league);
    byName.set(league.name, arr);
  }

  console.log(`Found ${byName.size} distinct league name(s):\n`);

  let franchisesCreated = 0;
  let membershipsCreated = 0;
  let leaguesUpdated = 0;

  for (const [name, leagueGroup] of byName) {
    // Latest season first (already sorted desc)
    const latest = leagueGroup[0];

    console.log(`  "${name}" — ${leagueGroup.length} season(s), latest: ${latest.season}`);

    // 2. Create Franchise (upsert to be idempotent)
    const franchise = await prisma.franchise.upsert({
      where: { name },
      create: {
        name,
        isPublic: latest.isPublic,
        publicSlug: latest.publicSlug,
        inviteCode: latest.inviteCode,
        tradeReviewPolicy: latest.tradeReviewPolicy,
        vetoThreshold: latest.vetoThreshold,
      },
      update: {}, // Don't overwrite if already exists (idempotent re-run)
    });
    franchisesCreated++;

    // 3. Set franchiseId on all leagues with this name
    for (const league of leagueGroup) {
      if (league.franchiseId !== franchise.id) {
        await prisma.league.update({
          where: { id: league.id },
          data: { franchiseId: franchise.id },
        });
        leaguesUpdated++;
      }
    }

    // 4. Collect all memberships across seasons, deduplicate by userId
    const userRoles = new Map<number, "COMMISSIONER" | "OWNER">();
    for (const league of leagueGroup) {
      for (const m of league.memberships) {
        const existing = userRoles.get(m.userId);
        // COMMISSIONER > OWNER
        if (!existing || (m.role === "COMMISSIONER" && existing !== "COMMISSIONER")) {
          userRoles.set(m.userId, m.role as "COMMISSIONER" | "OWNER");
        }
      }
    }

    // 5. Create FranchiseMembership entries
    for (const [userId, role] of userRoles) {
      try {
        await prisma.franchiseMembership.upsert({
          where: {
            franchiseId_userId: { franchiseId: franchise.id, userId },
          },
          create: { franchiseId: franchise.id, userId, role },
          update: {}, // Don't overwrite
        });
        membershipsCreated++;
      } catch (e) {
        console.warn(`    Warning: failed to create membership for user ${userId}: ${e}`);
      }
    }

    console.log(`    → Franchise ID: ${franchise.id}, ${userRoles.size} member(s)`);
  }

  console.log(`\nDone!`);
  console.log(`  Franchises created/verified: ${franchisesCreated}`);
  console.log(`  Leagues updated with franchiseId: ${leaguesUpdated}`);
  console.log(`  FranchiseMemberships created/verified: ${membershipsCreated}`);

  // Verify all leagues have franchiseId
  const orphaned = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "League" WHERE "franchiseId" IS NULL`.then(r => Number(r[0].count));
  if (orphaned > 0) {
    console.warn(`\n⚠️  ${orphaned} league(s) still have NULL franchiseId!`);
  } else {
    console.log(`\n✅ All leagues have franchiseId set.`);
  }
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
