// server/src/scripts/propagate_mlb_data.ts
/**
 * Consolidated MLB ID + fullName propagation across periods.
 * Replaces: propagate_mlb_ids.ts, propagate_by_team_name.ts
 *
 * Logic: If a player (identified by playerName + teamCode) has an MLB ID
 * in any period, copy mlbId and fullName to all their other periods.
 *
 * Usage:
 *   npx tsx src/scripts/propagate_mlb_data.ts              # all years
 *   npx tsx src/scripts/propagate_mlb_data.ts --year 2025  # single year
 *   npx tsx src/scripts/propagate_mlb_data.ts --all-years  # explicit all years (same as no flag)
 */

import 'dotenv/config';
import { prisma } from '../db/prisma';

// ── Core logic ─────────────────────────────────────────────────────────────

async function propagateForYear(year: number): Promise<{ updated: number; remaining: number }> {
  console.log(`\n=== Propagating MLB data for ${year} ===`);

  // Build lookup from all records that already have an mlbId
  const linked = await prisma.historicalPlayerStat.findMany({
    where: {
      period: { season: { year } },
      mlbId: { not: null },
      fullName: { not: null },
    },
    select: { playerName: true, teamCode: true, mlbId: true, fullName: true },
    distinct: ['playerName', 'teamCode'],
  });

  console.log(`  Source: ${linked.length} unique player-team combos with MLB IDs`);

  const lookup = new Map<string, { mlbId: string; fullName: string }>();
  for (const p of linked) {
    const key = `${p.playerName.toLowerCase().trim()}_${p.teamCode}`;
    lookup.set(key, { mlbId: p.mlbId!, fullName: p.fullName! });
  }

  // Find all unlinked records for this year
  const unlinked = await prisma.historicalPlayerStat.findMany({
    where: {
      period: { season: { year } },
      OR: [{ mlbId: null }, { mlbId: '' }, { fullName: null }],
    },
    select: {
      id: true,
      playerName: true,
      teamCode: true,
      period: { select: { periodNumber: true } },
    },
  });

  console.log(`  Unlinked: ${unlinked.length} records to check`);

  let updated = 0;
  for (const stat of unlinked) {
    const key = `${stat.playerName.toLowerCase().trim()}_${stat.teamCode}`;
    const match = lookup.get(key);
    if (match) {
      await prisma.historicalPlayerStat.update({
        where: { id: stat.id },
        data: { mlbId: match.mlbId, fullName: match.fullName },
      });
      updated++;
    }
  }

  // Cross-year propagation: also check if the same playerName exists in OTHER years
  // This handles players whose names appear consistently across seasons
  const stillUnlinked = await prisma.historicalPlayerStat.count({
    where: {
      period: { season: { year } },
      OR: [{ mlbId: null }, { mlbId: '' }],
    },
  });

  console.log(`  Updated: ${updated} records`);
  console.log(`  Still unlinked: ${stillUnlinked} records`);

  return { updated, remaining: stillUnlinked };
}

// ── CLI ────────────────────────────────────────────────────────────────────

function parseYear(): number | null {
  const idx = process.argv.indexOf('--year');
  if (idx === -1) return null;
  const val = parseInt(process.argv[idx + 1]);
  if (!Number.isFinite(val)) {
    console.error('Invalid --year value');
    process.exit(1);
  }
  return val;
}

async function main() {
  const targetYear = parseYear();

  let years: number[];
  if (targetYear) {
    years = [targetYear];
  } else {
    const seasons = await prisma.historicalSeason.findMany({
      select: { year: true },
      orderBy: { year: 'asc' },
    });
    years = seasons.map((s) => s.year);
  }

  console.log(`Processing years: ${years.join(', ')}`);

  let grandTotal = 0;
  for (const year of years) {
    const { updated } = await propagateForYear(year);
    grandTotal += updated;
  }

  console.log(`\n=== Complete: ${grandTotal} total records updated ===\n`);
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
