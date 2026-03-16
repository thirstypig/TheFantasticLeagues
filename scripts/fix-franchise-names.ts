/**
 * Fix franchise names: merge leagues with similar names (e.g., "OGBA 2025" + "OGBA 2026")
 * into a single franchise by stripping year suffixes.
 *
 * Usage: npx tsx scripts/fix-franchise-names.ts
 */

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";

const prisma = new PrismaClient();

/** Strip trailing year from name: "OGBA 2025" → "OGBA" */
function baseName(name: string): string {
  return name.replace(/\s+\d{4}$/, "").trim();
}

async function main() {
  const franchises = await prisma.franchise.findMany({
    include: {
      leagues: { select: { id: true, name: true, season: true } },
      memberships: { select: { id: true, userId: true, role: true } },
    },
    orderBy: { id: "asc" },
  });

  // Group franchises by base name
  const groups = new Map<string, typeof franchises>();
  for (const f of franchises) {
    const base = baseName(f.name);
    const arr = groups.get(base) ?? [];
    arr.push(f);
    groups.set(base, arr);
  }

  for (const [base, group] of groups) {
    if (group.length <= 1) {
      // Rename single franchise if name has year suffix
      const f = group[0];
      if (f.name !== base) {
        console.log(`Renaming franchise "${f.name}" → "${base}"`);
        await prisma.franchise.update({
          where: { id: f.id },
          data: { name: base },
        });
      }
      continue;
    }

    console.log(`\nMerging ${group.length} franchises into "${base}":`);

    // Keep the first one, merge others into it
    const primary = group[0];
    const toMerge = group.slice(1);

    // Rename primary
    if (primary.name !== base) {
      await prisma.franchise.update({
        where: { id: primary.id },
        data: { name: base },
      });
    }

    for (const other of toMerge) {
      console.log(`  Merging franchise "${other.name}" (ID ${other.id}) → primary "${base}" (ID ${primary.id})`);

      // Move leagues
      for (const league of other.leagues) {
        await prisma.league.update({
          where: { id: league.id },
          data: { franchiseId: primary.id },
        });
        console.log(`    Moved league "${league.name}" season ${league.season}`);
      }

      // Move memberships (upsert to avoid duplicates)
      for (const m of other.memberships) {
        const existing = primary.memberships.find((pm) => pm.userId === m.userId);
        if (existing) {
          // Upgrade to COMMISSIONER if the other franchise had them as commissioner
          if (m.role === "COMMISSIONER" && existing.role !== "COMMISSIONER") {
            await prisma.franchiseMembership.update({
              where: { id: existing.id },
              data: { role: "COMMISSIONER" },
            });
          }
        } else {
          try {
            await prisma.franchiseMembership.create({
              data: {
                franchiseId: primary.id,
                userId: m.userId,
                role: m.role as "COMMISSIONER" | "OWNER",
              },
            });
          } catch {
            // Ignore duplicates
          }
        }
      }

      // Merge org-level fields from latest franchise if primary doesn't have them
      if (!primary.inviteCode && other.inviteCode) {
        await prisma.franchise.update({
          where: { id: primary.id },
          data: { inviteCode: other.inviteCode },
        });
      }

      // Delete the now-empty franchise
      // First delete its memberships
      await prisma.franchiseMembership.deleteMany({
        where: { franchiseId: other.id },
      });
      await prisma.franchise.delete({ where: { id: other.id } });
      console.log(`    Deleted franchise ID ${other.id}`);
    }
  }

  // Final verification
  const remaining = await prisma.franchise.findMany({
    include: { leagues: { select: { id: true, name: true, season: true } } },
  });
  console.log("\nFinal state:");
  for (const f of remaining) {
    console.log(`  "${f.name}" (ID ${f.id}) — ${f.leagues.length} season(s): ${f.leagues.map((l) => `${l.name} ${l.season}`).join(", ")}`);
  }

  const orphaned = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "League" WHERE "franchiseId" IS NULL`.then(r => Number(r[0].count));
  if (orphaned > 0) {
    console.warn(`\n⚠️  ${orphaned} league(s) still have NULL franchiseId!`);
  } else {
    console.log(`\n✅ All leagues have franchiseId set.`);
  }
}

main()
  .catch((e) => {
    console.error("Fix failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
