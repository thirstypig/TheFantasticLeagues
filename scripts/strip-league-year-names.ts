/**
 * Strip trailing year suffix from league names.
 * "OGBA 2025" → "OGBA", "OGBA 2026" → "OGBA"
 *
 * Usage: npx tsx scripts/strip-league-year-names.ts
 */

import { PrismaClient } from "../server/node_modules/.prisma/client/index.js";

const prisma = new PrismaClient();

async function main() {
  const leagues = await prisma.league.findMany({ select: { id: true, name: true, season: true } });
  for (const l of leagues) {
    const stripped = l.name.replace(/\s+\d{4}$/, "").trim();
    if (stripped !== l.name) {
      console.log(`Renaming league ${l.id}: "${l.name}" → "${stripped}"`);
      await prisma.league.update({ where: { id: l.id }, data: { name: stripped } });
    } else {
      console.log(`League ${l.id}: "${l.name}" — no change`);
    }
  }
  console.log("\nDone!");
}

main()
  .catch((e) => { console.error("Failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
